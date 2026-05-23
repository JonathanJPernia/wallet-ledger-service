# Guía de tests — Wallet Ledger Service

> **Estrategia por riesgos:** qué riesgo cubre cada test y por qué existe → **[tests-risks.md](./tests-risks.md)** (checklist de evaluación, no cobertura %).  
> **Arquitectura y diseño:** **[docs/architecture.md](./docs/architecture.md)**.

Todos los tests asumen **PostgreSQL** accesible vía `DATABASE_URL` (ver `.env.example`). Levanta la DB antes de E2E o load:

```bash
npm run docker:up
npx prisma migrate deploy
```

---

## Resumen rápido

| Comando | Qué ejecuta |
|---------|----------------|
| **`npm run test:final`** | **Evaluación final** (orden fijo, reset DB, falla si cualquier paso falla) |
| `npm test` | Unit tests (`src/**/*.spec.ts` + `test/**/*.spec.ts`, excepto `test/e2e` y `test/load`) |
| `npm run test:e2e` | Todos los E2E (`test/e2e/*.spec.ts` + `test/*.e2e-spec.ts`) |
| `npm run test:e2e:financial` | STEP 1 (reset DB + jest-final config) |
| `npm run test:e2e:concurrency` | STEP 2 (idem) |
| `npm run test:e2e:risks` | E2E focalizados R1/R16 + R15 (doble clic + GET saldo/movimientos) |
| `npm run test:load` | Load tests (requieren `RUN_LOAD_TESTS=true` + DB) |
| `npm run test:audit` | STEP 3 — money integrity (reset DB automático) |
| `npm run test:reporting` | STEP 4 — P&L (reset DB + assert global al cierre) |
| `npm run test:cov` | Unit tests con cobertura |
| `npm run test:watch` | Unit tests en watch |
| `npm run test:all` | Unit + E2E seguidos |

---

## 0. Evaluación final (`npm run test:final`)

Comando único para CI / examen. Ejecuta **en orden** (cada paso en proceso Jest separado, `--runInBand`, timeout 180s):

1. `test/e2e/financial-flow.spec.ts`
2. `test/e2e/concurrency-caso-a.spec.ts` (misma idempotency key)
3. `test/e2e/concurrency-caso-b.spec.ts` (keys distintas)
4. `test/audit/money-integrity.spec.ts`
5. `test/reporting/pnl.spec.ts`
6. `test/final/global-conservation.final.spec.ts` — **assert explícito final**

Antes de **cada** paso (`beforeAll`):

- `TEST_DB_AUTO_RESET=true` → truncate tablas financieras vía cliente Prisma dedicado (`test/support/test-db-bootstrap.ts`)
- Borra wallets USER y deja `SYSTEM_FEE` en cero

Cierre del examen (paso 5 y también al final del STEP 4):

```text
SUM(wallets.currentBalance) === SUM(ledger_entries signed amount)
```

```bash
npm run docker:up
npx prisma migrate deploy
npm run test:final
```

Config: `test/jest-final.json` + `test/scripts/run-final-suite.mjs`.

---

## 1. Unit tests (`npm test`)

Prueban lógica aislada (políticas, guards, utilidades) **sin levantar HTTP**.

Ubicación: `test/*.spec.ts` (y specs bajo `src/` si existen).

Ejemplos:

- `idempotency-replay.spec.ts`, `idempotency-failure.spec.ts`
- `fee.policy.spec.ts`, `lock-resolver.spec.ts`
- `drift-severity.spec.ts`, `export-streaming.spec.ts`
- `risk-policy.spec.ts`, `ledger-reconstruction.spec.ts`
- `reporting-financial.spec.ts`, `snapshot-policy.spec.ts`

```bash
npm test
npm test -- --testPathPattern=drift-severity
```

---

## 2. E2E tests (`npm run test:e2e`)

Integración **real**: NestJS + Supertest + PostgreSQL. Sin mocks de ledger, fees ni idempotency.

Config: `test/jest-e2e.json` (timeout 120s, `setupFiles: e2e-env.ts`, `--runInBand` en el script npm).

### Health smoke

| Archivo | Descripción |
|---------|-------------|
| `test/app.e2e-spec.ts` | `GET /api/health` |

### STEP 1 — Flujo financiero completo

| Archivo | Descripción |
|---------|-------------|
| `test/e2e/financial-flow.spec.ts` | Deposit → transfer → withdraw → fees → reconciliation → P&L |

```bash
npm run test:e2e -- test/e2e/financial-flow.spec.ts
```

**Flujo:** wallet 100 USD → transfer 30 → withdraw 20 → asserts balances, SYSTEM_FEE, ledger vs projection, reconciliation, P&L = FEE_IN.

### STEP 2 — Concurrencia e idempotency

| Archivo | Descripción |
|---------|-------------|
| `test/e2e/concurrency-caso-*.spec.ts` | 75 withdraws (A: misma key, B: keys distintas) |

```bash
npm run test:e2e -- test/e2e/concurrency.spec.ts
```

**CASO A:** misma `Idempotency-Key` → 1 withdraw real + 74 replays en chunks de 5 (evita saturar Prisma/HTTP).  
**CASO B:** keys `wd-1`…`wd-N` → N retiros de $1 según fondos; sin balance negativo ni ledger duplicado.

> Concurrencia usa `createE2eConcurrencyApp()` (sin risk velocity ni circuit breaker en wallet) y `test/e2e/e2e-env.ts` sube el rate limit vía `E2E_THROTTLE_LIMIT` (setupFiles en `jest-e2e.json`). La lógica de ledger/idempotency no se mockea.

### Todos los E2E

```bash
npm run test:e2e
```

---

## 3. Auditoría — Money integrity (`npm run test:audit`)

**STEP 3 — Examen fintech:** demuestra que el sistema no crea ni destruye dinero.

| Archivo | Descripción |
|---------|-------------|
| `test/audit/money-integrity.spec.ts` | Escenario determinista + ecuación global |
| `test/audit/money-integrity-audit.util.ts` | Agregaciones SQL (proyección vs ledger) |

```bash
npm run test:audit
# o
npm test -- test/audit/money-integrity.spec.ts
```

**Ecuación global (debe cuadrar al centavo):**

```text
SUM(wallets.currentBalance)  ===  SUM(ledger_entries signed amount)
```

Incluye `SYSTEM_FEE` (ya está en `wallets`). También valida:

1. Sin drift global (pre-flight y post-escenario)
2. `FEE_IN` total = `FEE_OUT` total (fees no se pierden)
3. Delta `SYSTEM_FEE` = fees del escenario (200→1.00, 100→1.00)
4. `reconciliation.isConsistent === true` por cada wallet con actividad en ledger

**Escenario determinista:** deposit 2000 → transfer 200 → withdraw 100.

> Con `TEST_DB_AUTO_RESET=true` (scripts `test:audit`, `test:final`) la DB se trunca antes del escenario; no depende de drift histórico en dev.

---

## 4. Reporting / P&L (`npm run test:reporting`)

**STEP 4:** valida que `GET /api/reporting/pnl` coincide con el ledger.

| Archivo | Descripción |
|---------|-------------|
| `test/reporting/pnl.spec.ts` | Deposit + transfer + withdraw → P&L vs SQL vs repository |
| `test/reporting/pnl-audit.util.ts` | Agregaciones FEE_IN raw SQL |

```bash
npm run test:reporting
# o
npm test -- test/reporting/pnl.spec.ts
```

**Asserts:** `totalRevenue` = SUM(FEE_IN), breakdown TRANSFER/WITHDRAW, `DEPOSIT: 0.00`, `netProfit === totalRevenue`, rango `startDate`/`endDate` del test, API = repository = SQL manual.

---

## 5. Load tests (`npm run test:load`)

Pruebas opcionales contra DB real. **No corren** en `npm test` por defecto.

| Archivo | Requisitos |
|---------|------------|
| `test/load/idempotency-concurrency.spec.ts` | `RUN_LOAD_TESTS=true`, API en `:3000` |
| `test/load/partition-pruning.spec.ts` | `RUN_LOAD_TESTS=true`, DB con particiones |

```bash
# Terminal 1
npm run start:dev

# Terminal 2
npm run test:load
```

---

## 6. Cobertura y debug

```bash
npm run test:cov
npm run test:debug
```

---

## 7. CI recomendado

```bash
npm run lint:check
npm run format:check
npm run build
npm test
npm run test:final
# opcional en staging:
# RUN_LOAD_TESTS=true npm run test:load
```

---

## 8. Troubleshooting

| Problema | Solución |
|----------|----------|
| E2E connection refused | `npm run docker:up`, revisar `DATABASE_URL` puerto `5433` |
| Migraciones pendientes | `npx prisma migrate deploy` |
| E2E 429 Too Many Requests | En concurrencia usar `createE2eConcurrencyApp()` (ya aplicado) |
| CASO B `ECONNRESET` / 500 | `jest-final-env` sube `connection_limit`; CASO B usa tope `E2E_HTTP_CONCURRENCY=20` (75 retiros totales) y crons off |
| Risk blocked en E2E | Mismo bootstrap de concurrencia desactiva velocity guard |
| Load tests skipped | Exportar `RUN_LOAD_TESTS=true` |

---

## Índice de archivos de test

```
test/
  jest-final.json
  scripts/run-final-suite.mjs   # npm run test:final
  support/
    test-db-bootstrap.ts        # TRUNCATE tablas financieras
    jest-final-env.ts           # timeout 180s + TEST_DB_AUTO_RESET
  final/
    global-conservation.final.spec.ts  # assert examen final
  app.e2e-spec.ts
  *.spec.ts                    # unit
  e2e/
    e2e-env.ts                 # E2E_THROTTLE_LIMIT (setupFiles)
    setup-e2e-app.ts
    e2e-db-assertions.ts
    financial-flow.spec.ts     # STEP 1
    concurrency.harness.ts
    concurrency-caso-a.spec.ts # STEP 2a
    concurrency-caso-b.spec.ts # STEP 2b
  audit/
    money-integrity-audit.util.ts
    money-integrity.spec.ts      # STEP 3
  reporting/
    pnl-audit.util.ts
    pnl.spec.ts                  # STEP 4
  load/
    idempotency-concurrency.spec.ts
    partition-pruning.spec.ts
```

Cuando se añadan nuevos tests, documentarlos en esta tabla y en el README principal.
