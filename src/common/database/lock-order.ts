/**
 * Orden global de locks (pessimista) — SIEMPRE respetar en todas las operaciones financieras.
 *
 * 1. idempotency_keys   (scope + key, FOR UPDATE)
 * 2. wallets            (ids ordenados lexicográficamente asc)
 * 3. transaction_groups (si se bloquean explícitamente en transferencias complejas)
 * 4. ledger_entries     (raro; normalmente se insertan sin lock previo)
 *
 * Depósito / withdraw: (1) → (2) una wallet.
 * Transfer: (1) → (2) dos wallets en orden asc.
 *
 * ## Alcance actual (single PostgreSQL primary)
 * - `sort()` por walletId en runtime es suficiente para evitar deadlock A↔B.
 *
 * ## No asumir en futuro (sharding / multi-region)
 * - Orden lexicográfico local NO es global si wallets viven en shards distintos.
 * - Requiere: lock manager central, saga coordinator, o partition key + cola por wallet.
 * - Ver `docs/financial-design.md` → "Lock ordering y escalado".
 */
export const LOCK_ORDER = [
  'idempotency_keys',
  'wallets',
  'transaction_groups',
  'ledger_entries',
] as const;

export type LockResource = (typeof LOCK_ORDER)[number];
