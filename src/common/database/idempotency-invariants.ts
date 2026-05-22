/**
 * INVARIANTE FINANCIERO (no negociable):
 *
 * En operación normal, idempotency.status === COMPLETED
 * ⟺ transaction_group.status === COMPLETED
 * ⟺ misma transacción DB (un solo COMMIT).
 *
 * - completeIdempotency() es SIEMPRE el último paso de la TX financiera.
 * - responseBody solo es válido si el group ya está COMPLETED en el mismo commit.
 *
 * Fast path (findSafeCommittedReplay) exige AMBOS estados COMPLETED + join;
 * no sustituye al claim FOR UPDATE.
 */
export const IDEMPOTENCY_GROUP_INVARIANT_DOC =
  'idempotency COMPLETED iff transactionGroup COMPLETED (atomic commit)';
