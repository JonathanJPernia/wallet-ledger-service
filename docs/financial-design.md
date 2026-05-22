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

### Fast path (`findSafeCommittedReplay`) — solo performance

Lectura **fuera** de la TX, antes de `runSerializable`:

- Condiciones: `idempotency.status = COMPLETED`, `responseBody` presente, `transaction_group.status = COMPLETED` (y tipo acorde en transfer).
- Propósito: evitar TX Serializable en retries exitosos ya persistidos.
- **No es mecanismo de seguridad.** Ventana teórica post-commit es aceptable: si el join es consistente, el commit ya ocurrió; si otra request entra en paralelo, el claim `FOR UPDATE` serializa la siguiente ejecución.
- Replay incorrecto por inconsistencia manual en DB es riesgo operativo (reconciliación), no de carrera normal.

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
  2. lock wallets [from, to] id asc (FOR UPDATE)
  3. validate ACTIVE, currency, funds
  4. transaction_group TRANSFER PENDING
  5. ledger TRANSFER_OUT + TRANSFER_IN (amount > 0)
  6. update both projections (version++)
  7. transaction_group COMPLETED
  8. idempotency COMPLETED + response (ÚLTIMO)
COMMIT
```

## Reconciliación (job futuro)

```
expected = SUM(ledger effect by operationType)
actual   = wallet.currentBalance
```

Si `expected != actual` → alerta operativa.
