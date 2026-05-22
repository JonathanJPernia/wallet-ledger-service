import { IdempotencyStatus, TransactionGroupStatus } from '@prisma/client';
import { safeCommittedIdempotencyWhere } from '../src/common/database/idempotency-replay';

describe('safeCommittedIdempotencyWhere', () => {
  it('requires idempotency and transaction group both COMPLETED', () => {
    const where = safeCommittedIdempotencyWhere('wallet.withdraw', 'key-1');

    expect(where.status).toBe(IdempotencyStatus.COMPLETED);
    expect(where.transactionGroupId).toEqual({ not: null });
    expect(where.transactionGroup).toMatchObject({
      status: TransactionGroupStatus.COMPLETED,
    });
    expect(where.responseStatus).toEqual({ not: null });
  });
});
