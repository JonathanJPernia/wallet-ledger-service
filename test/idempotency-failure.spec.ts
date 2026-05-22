import { shouldPersistIdempotencyFailure } from '../src/common/database/idempotency-failure';
import {
  ConcurrencyConflictException,
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
  InsufficientFundsException,
  SerializationFailureException,
} from '../src/common/errors/financial.exceptions';
import { WalletNotActiveException } from '../src/common/errors/financial.exceptions';

describe('shouldPersistIdempotencyFailure', () => {
  it('persists FAILED for business errors', () => {
    expect(
      shouldPersistIdempotencyFailure(new InsufficientFundsException('w1')),
    ).toBe(true);
    expect(
      shouldPersistIdempotencyFailure(
        new WalletNotActiveException('w1', 'FROZEN'),
      ),
    ).toBe(true);
  });

  it('does not persist for retryable idempotency/concurrency errors', () => {
    expect(
      shouldPersistIdempotencyFailure(new SerializationFailureException()),
    ).toBe(false);
    expect(
      shouldPersistIdempotencyFailure(new IdempotencyConflictException('k')),
    ).toBe(false);
    expect(
      shouldPersistIdempotencyFailure(
        new IdempotencyPayloadMismatchException('k'),
      ),
    ).toBe(false);
    expect(
      shouldPersistIdempotencyFailure(new ConcurrencyConflictException('w1')),
    ).toBe(false);
  });
});
