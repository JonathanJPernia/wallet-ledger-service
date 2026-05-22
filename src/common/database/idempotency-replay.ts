import {
  IdempotencyStatus,
  Prisma,
  TransactionGroupStatus,
  type TransactionGroupType,
} from '@prisma/client';

/**
 * Filtro compartido para fast path: replay solo si commit financiero completo.
 * Requiere idempotency COMPLETED + group COMPLETED (+ tipo opcional).
 */
export function safeCommittedIdempotencyWhere(
  scope: string,
  key: string,
  groupType?: TransactionGroupType,
) {
  return {
    scope,
    key,
    status: IdempotencyStatus.COMPLETED,
    responseStatus: { not: null },
    responseBody: { not: Prisma.DbNull },
    transactionGroupId: { not: null },
    transactionGroup: {
      status: TransactionGroupStatus.COMPLETED,
      ...(groupType !== undefined ? { type: groupType } : {}),
    },
  } satisfies Prisma.IdempotencyKeyWhereInput;
}
