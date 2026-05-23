# Diseño financiero — wallet ledger service

## Invariantes

1. **Balance nunca negativo** — validado en app bajo `FOR UPDATE`; **CHECK `currentBalance >= 0`** en DB.
2. **Ledger append-only** — solo `INSERT` en `ledger_entries`.
3. **Una operación lógica → N asientos** — `TransactionGroup` 1:N `LedgerEntry`.
4. **`currentBalance` coherente con ledger** — misma TX en escritura; job de reconciliación periódico.
5. **Una idempotency key no ejecuta dos veces** — `@@unique([scope, key])` + respuesta cacheada.
6. **`amount` siempre positivo** — semántica en `operationType`; **CHECK `amount > 0`** en DB.
7. **Dinero > performance** — transacciones `Serializable`, no `ReadCommitted`.

## Idempotency: safety vs fast path

### Mecanismo de seguridad (obligatorio)

Dentro de **TX Serializable**:

1. `claimIdempotencyInTransaction` → `SELECT … FOR UPDATE` en `idempotency_keys`
2. `PROCESSING` bloquea duplicados (`409`)
3. `COMPLETE` + `responseBody` solo al **final** de la TX financiera (mismo commit que ledger)

**La garantía financiera de no doble ejecución depende del claim + locks, no del fast path.**

### Invariante: idempotency COMPLETED ⟺ transactionGroup COMPLETED

**Regla fuerte (mismo COMMIT):**

```
idempotency.status === COMPLETED
  ⟺ transaction_group.status === COMPLETED
  ⟺ transactionGroupId presente
  ⟺ responseBody escrito (último paso de la TX)
```

Si divergen (ej. group COMPLETED sin idempotency actualizada) → **no replay** en fast path; dentro de TX el `claim` lanza `409` con mensaje de violación de invariante.

Implementación: `safeCommittedIdempotencyWhere()` + `claimIdempotencyInTransaction` valida group antes de `cached`.

### Fast path (`findSafeCommittedReplay`) — solo performance

Lectura **fuera** de la TX, antes de `runSerializable`:

- Usa `safeCommittedIdempotencyWhere`: exige **ambos** COMPLETED + tipo de operación (DEPOSIT / TRANSFER / WITHDRAW).
- **No es mecanismo de seguridad.** Safety = `claim` + `FOR UPDATE`.
- Inconsistencia manual en DB → reconciliación / ops, no replay parcial silencioso.

### FAILED observability

Si la TX financiera hace **rollback** (error de negocio, etc.):

- La fila `PROCESSING` desaparece con el rollback.
- `recordIdempotencyFailureOutsideTx` escribe `FAILED` + `failureReason` + `failedAt` en **TX independiente** (no dentro de TX abortada).
- No se marca FAILED para: `SERIALIZATION_FAILURE`, `IDEMPOTENCY_CONFLICT`, `IDEMPOTENCY_PAYLOAD_MISMATCH`, `CONCURRENCY_CONFLICT` (reintento esperado).

## Orden global de locks

1. `idempotency_keys` (FOR UPDATE)
2. `wallets` (FOR UPDATE, **id lexicográfico asc**)
3. `transaction_groups` (cuando aplique)
4. `ledger_entries` (insert append-only)

Ver `src/common/database/lock-order.ts`.

### Lock ordering y escalado

| Hoy (MVP) | Futuro sharding / multi-region |
|-----------|--------------------------------|
| Un PostgreSQL primario | Varios nodos / shards |
| `walletId.sort()` evita deadlock local | Orden local ≠ orden global |
| `FOR UPDATE` en SQL | Locks distribuidos o cola por partition key |

Antes de batch transfers o multi-wallet async: revisar lock manager central o diseño saga.

## Proyección wallet (write skew)

Defensa en capas:

1. **Pessimistic:** `FOR UPDATE` en wallets antes de leer balance.
2. **Optimistic:** `updateMany` con `version` esperado.
3. **Serializable:** aislamiento + reintentos con **backoff exponencial + jitter** (máx. 5).

Riesgo bajo carga extrema: “retry storm” por muchos `40001`. Mitigación: jitter, límite de intentos, métricas en log `serialization.retry`.

## Depósito — una transacción Serializable

```
BEGIN TX (Serializable)
  1. lock/claim idempotency (FOR UPDATE)
  2. lock wallet(s) asc (FOR UPDATE)
  3. create transaction_group (PENDING)
  4. create ledger_entry (DEPOSIT)
  5. update wallet (balance + version)
  6. complete transaction_group (COMPLETED)
  7. complete idempotency (COMPLETED + response)  ← SIEMPRE ÚLTIMO
COMMIT
```

**Idempotency mismatch:** `mismatch_audit` JSON en TX independiente.

## Transferencia A → B

```
BEGIN TX (Serializable)
  1. lock/claim idempotency (scope: wallet.transfer)
  2. lock wallets [from, to, SYSTEM_FEE_WALLET] id asc (FOR UPDATE)
  3. validate ACTIVE, currency, funds >= base + fee
  4. transaction_group TRANSFER PENDING
  5. ledger TRANSFER_OUT + TRANSFER_IN (amount > 0)
  6. ledger FEE_OUT (sender) + FEE_IN (SYSTEM_FEE_WALLET), misma group
  7. update projections (from, to, fee wallet)
  8. transaction_group COMPLETED
  9. idempotency COMPLETED + response (ÚLTIMO)
COMMIT
```

`POST /api/wallets/transfer` — scope `wallet.transfer`. Fee transfer: **0.5%** del monto base.

## Withdraw (cash-out) — FASE 2.7

```
BEGIN TX (Serializable)
  1. lock/claim idempotency (scope: wallet.withdraw)
  2. lock wallet + SYSTEM_FEE_WALLET (FOR UPDATE, id asc)
  3. validate ACTIVE, amount > 0, balance >= base + fee
  4. transaction_group WITHDRAW PENDING
  5. ledger_entry WITHDRAW (amount > 0)
  6. ledger FEE_OUT + FEE_IN (misma group)
  7. update projections (user + fee wallet)
  8. transaction_group COMPLETED
  9. idempotency COMPLETED + response (ÚLTIMO)
COMMIT
```

Fee withdraw: **1%** del monto base.

## Fees / revenue — FASE 2.8

- Wallet interna `SYSTEM_FEE` **por moneda** (`WalletKind.SYSTEM_FEE` + índice único parcial por `currency`).
- **FeeIntent** (pre-commit): `baseAmount`, `feeAmount`, `totalDebit`, balances derivados antes de ledger.
- Política: `fee.policy.ts` — rates; `FeesService.applyFee` solo persiste según intent.
- **LockResolverService**: orden determinista del lock set (from/to/fee, extensible).
- Idempotency: validación de `responseBody` al persistir; replay con rebuild desde ledger si snapshot corrupto.

### Snapshots inmutables (2.9 fix)

- `periodStart` / `periodEnd` explícitos (cierre `[start, end)` UTC).
- **Fuera de ventana de corrección (7 días):** insert-only; si existe → skip (nunca UPDATE).
- **Dentro de ventana:** delete+insert para late-arriving (solo días recientes).
- Cron 00:00 UTC: re-procesa últimos 7 días × todas las monedas del ledger.
- Exports: keyset pagination por chunks (5k filas), memoria O(chunk).
- Ledger guard: `UNIQUE (transactionGroupId, operationType, walletId)` donde group no null.
- Ledger: `FEE_OUT` (débito pagador) + `FEE_IN` (crédito revenue); siempre misma `transactionGroup` que la operación padre (idempotencia atómica).
- Depósito: 0% por defecto (configurable en policy).
- `SYSTEM_FEE` no puede transferir ni retirar vía API usuario.

`POST /api/wallets/:id/withdraw` — scope `wallet.withdraw`; mismas garantías que deposit bajo concurrencia.

## Reconciliación (FASE 2.6 — read-only)

**Ledger = fuente de verdad.** `wallet.currentBalance` = proyección.

```
ledgerBalance = SUM(
  DEPOSIT       → +amount
  TRANSFER_IN   → +amount
  FEE_IN        → +amount
  WITHDRAW      → -amount
  TRANSFER_OUT  → -amount
  FEE_OUT       → -amount
  (otro tipo)   → 0  — no ELSE implícito como débito
)

difference = projectionBalance - ledgerBalance
isConsistent = (difference == 0)
```

Endpoints:

- `GET /api/reconciliation/wallets/:walletId` — una wallet
- `GET /api/reconciliation/drift` — solo wallets inconsistentes

**Nunca** actualiza balances ni repara drift automáticamente.

Log drift: `reconciliation.drift_detected` + código `RECONCILIATION_DRIFT_DETECTED`.

## Reporting / P&L — FASE 2.9 (read-only)

Capa analítica sobre ledger (nunca muta wallets ni ledger).

- `GET /api/reporting/pnl` — revenue = `FEE_IN`, breakdown por `transaction_group.type`
- `GET /api/reporting/analytics/system` — volumen, fees, top wallets (SQL agregado)
- `GET /api/reporting/analytics/wallets/:id` — depósitos, retiros, net flow
- `GET /api/reporting/audit/wallets/:id/rebuild?toDate=` — replay ledger vs proyección
- `GET /api/reporting/snapshots` — cierres diarios (`financial_snapshots`)
- `POST /api/reporting/snapshots/run` — snapshot manual
- `GET /api/reporting/exports/*.csv` — ledger, revenue, reconciliation

Cron: `00:00 UTC` persiste snapshot del día anterior.

Futuro: auto-repair bajo aprobación humana (fuera de reporting).

## Financial Intelligence — FASE 3.0

Capa read-only + pre-flight guards sobre el ledger core.

| Módulo | Endpoints | Rol |
|--------|-----------|-----|
| `audit` | `/api/audit/replay`, `/diff`, `/system/rebuild` | Time-travel ledger, diff vs projection |
| `anomaly` | `/api/anomaly/wallets/:id`, `/scan` | Velocity / amount / graph flags |
| `risk` | `/api/risk/wallets/:id` | Composite score; blocks transfer/withdraw si LIMITED/BLOCKED |
| `events` | `/api/events/wallets/:id` | Event stream por operación (misma TX) |
| `materialized` | cron `*/15` UTC, `POST /refresh` | `mv_daily_*` aceleración reporting |
| `monitoring` | `/api/monitoring/live` | Fees/min, wallets activas, alertas |

**Write path:** `RiskScoringService.assertWalletAllowed` antes de transfer/withdraw.  
**Events:** `FinancialEventsService` append en TX al completar grupo.
