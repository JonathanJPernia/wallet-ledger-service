# Estrategia de testing por riesgos

---

## 1. Registro de riesgos

| ID | Riesgo | Impacto si falla | Cómo lo detectamos |
|----|--------|------------------|-------------------|
| **R1** | Doble gasto por reintento (misma operación aplicada dos veces) | Cliente pierde dinero o saldo incorrecto | Idempotency + E2E concurrencia |
| **R2** | Condición de carrera en retiros/transferencias concurrentes | Doble débito, saldo negativo, ledger incoherente | Locks + Serializable + CASO A/B |
| **R3** | Creación o destrucción de dinero (conservación global) | Sistema “imprime” o pierde fondos | Auditoría money-integrity + assert final |
| **R4** | Proyección (`wallet.currentBalance`) ≠ ledger | UI/reportes mienten; reconciliación falla | Reconciliation E2E + unit reconstruction |
| **R5** | Fees mal calculados o no acreditados a SYSTEM_FEE | Pérdida de ingresos / P&L falso | fee.policy + financial-flow + P&L |
| **R6** | Transferencia parcial (solo OUT o solo IN) | Dinero desaparece o duplicado entre wallets | Transfer atómico + lock ordering (unit) |
| **R7** | Replay idempotente devuelve respuesta incompleta o de otra operación | Cliente cree que falló y reintenta mal | idempotency-response-guard + replay where |
| **R8** | Fallo transitorio marca idempotency FAILED y bloquea reintentos | Operación válida queda “atascada” | idempotency-failure.spec |
| **R9** | Insuficientes fondos no rechazados | Saldo negativo, integridad rota | fee-intent + E2E withdraw/transfer |
| **R10** | Signo incorrecto en agregación ledger | Conservación global falsa +/- | ledger-signed-amount.spec |
| **R11** | Reporting P&L ≠ suma FEE_IN en ledger | Métricas financieras incorrectas | pnl.spec + reporting-financial |
| **R12** | Drift no clasificado / auto-repair peligroso | Reparar mal en prod | drift-severity.spec |
| **R13** | Abuso de velocidad (fraude / stress) | Saturación o movimientos anómalos | risk-policy + anomaly (unit); E2E sin velocity en concurrencia |
| **R14** | Circuit breaker no abre tras fallos | Cascada de errores en dependencias | circuit-breaker.policy.spec |
| **R15** | Consulta de saldo/movimientos inconsistente con ledger | Usuario ve saldo errado | wallet-read-api E2E + GET en financial-flow |
| **R16** | Clásico “doble clic” (2 POST misma key, poco paralelismo) | Doble retiro visible en UX | duplicate-withdraw-same-key E2E |
| **R17** | Export masivo agota memoria | OOM en reporting | export-streaming.spec |
| **R18** | Particiones ledger: scans sin podar | Degradación en prod con volumen | load/partition-pruning (opcional) |

---

## 2. Matriz riesgo → test

### E2E / integración (comportamiento real del sistema)

| Test | Riesgos | Por qué escribimos este test |
|------|---------|------------------------------|
| `test/e2e/financial-flow.spec.ts` | R4, R5, R6, R9, R11, R15 | **Camino feliz completo** en HTTP real: demuestra que deposit → transfer → withdraw dejan balances, fees, reconciliación y P&L alineados. Es el “smoke financiero” de producción. |
| `test/e2e/concurrency-caso-a.spec.ts` | R1, R2 | **Misma Idempotency-Key** bajo carga: el riesgo #1 en pagos. Esperamos 1 withdraw real y replays seguros (mismos IDs/saldos). |
| `test/e2e/concurrency-caso-b.spec.ts` | R2, R9 | **Keys distintas** en paralelo: el riesgo es serialización correcta sin doble deducción ni saldo negativo. |
| `test/e2e/duplicate-withdraw-same-key.spec.ts` | R1, R16 | Caso **pedagógico** (2 retiros $20 con $100 y misma key): reproduce el “doble clic” del front sin 75 goroutines. Complementa CASO A. |
| `test/e2e/wallet-read-api.spec.ts` | R4, R15 | **GET saldo y movimientos** deben reflejar el ledger tras operaciones; riesgo de API de consulta desincronizada. |
| `test/audit/money-integrity.spec.ts` | R3, R4, R5 | Escenario determinista + ecuación global: prueba que el sistema **no crea ni destruye** dinero. |
| `test/reporting/pnl.spec.ts` | R5, R11 | Ingresos por fees = FEE_IN en ledger; riesgo de reportes que mienten al negocio. |
| `test/final/global-conservation.final.spec.ts` | R3 | Cierre de examen: una sola ecuación global tras toda la suite. |
| `test/app.e2e-spec.ts` | — | Health: operabilidad mínima (no es riesgo financiero, es disponibilidad). |

### Unit tests (lógica crítica aislada)

| Test | Riesgos | Por qué escribimos este test |
|------|---------|------------------------------|
| `test/idempotency-replay.spec.ts` | R7 | El filtro `safeCommittedIdempotencyWhere` evita replays sobre operaciones incompletas. |
| `test/idempotency-failure.spec.ts` | R8 | Solo errores de negocio persisten FAILED; 40001/409 no deben bloquear reintentos. |
| `test/idempotency-response-guard.spec.ts` | R7 | Snapshots de respuesta incompletos no deben considerarse replay válidos. |
| `test/fee.policy.spec.ts` | R5 | Tarifas 0.5% transfer / 1% withdraw son reglas de negocio fijas; error aquí = bug en todo el flujo. |
| `test/fee-intent.spec.ts` | R9 | Validar fondos **antes** de commit evita estados imposibles. |
| `test/lock-resolver.spec.ts` | R6 | Orden determinista de locks en transfer evita deadlocks y doble procesamiento. |
| `test/ledger-signed-amount.spec.ts` | R10 | Sin CASE explícito por `OperationType`, la conservación global miente. |
| `test/ledger-reconstruction.spec.ts` | R4 | Rebuild desde ledger detecta drift de proyección. |
| `test/reporting-financial.spec.ts` | R4, R11 | Invariantes P&L/snapshot/reconciliation en mocks controlados. |
| `test/drift-severity.spec.ts` | R12 | Auto-repair solo en LOW; evita “arreglar” drifts graves en prod. |
| `test/risk-policy.spec.ts` | R13 | Umbrales de bloqueo por score de riesgo. |
| `test/anomaly-scoring.spec.ts` | R13 | Señales de velocidad/importe/ciclos anómalos. |
| `test/circuit-breaker.policy.spec.ts` | R14 | Apertura de circuito tras N fallos. |
| `test/snapshot-policy.spec.ts` | R11 | Snapshots inmutables salvo ventana de corrección. |
| `test/export-streaming.spec.ts` | R17 | CSV por chunks, no un string gigante. |
| `test/reporting-date.util.spec.ts` | R11 | Rangos UTC correctos para P&L diario. |

### Load (opcional, staging)

| Test | Riesgos | Por qué escribimos este test |
|------|---------|------------------------------|
| `test/load/idempotency-concurrency.spec.ts` | R1, R2 | Carga contra API viva; complementa E2E con más goroutines reales. |
| `test/load/partition-pruning.spec.ts` | R18 | Plan de query usa particiones por fecha. |

---

## 3. Suite de evaluación (`npm run test:final`)

Orden fijo — cada paso ataca riesgos distintos en secuencia:

| Paso | Archivo | Riesgos principales |
|------|---------|---------------------|
| 1 | `financial-flow.spec.ts` | R4–R6, R9, R11, R15 |
| 2a | `concurrency-caso-a.spec.ts` | R1, R2 |
| 2b | `concurrency-caso-b.spec.ts` | R2, R9 |
| 3 | `money-integrity.spec.ts` | R3, R4, R5 |
| 4 | `pnl.spec.ts` | R11 |
| FINAL | `global-conservation.final.spec.ts` | R3 |

Tests adicionales de riesgo (ejecutar en CI extendido o pre-release):

```bash
npm run test:e2e:risks
```

Incluye `duplicate-withdraw-same-key` y `wallet-read-api`.

---

