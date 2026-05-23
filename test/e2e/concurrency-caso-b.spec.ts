import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';
import {
  assertLedgerMatchesProjection,
  assertNoNegativeBalances,
  countCompletedIdempotencyByKeys,
  countIdempotencyRowsByKey,
  countWithdrawLedgerEntries,
  findDuplicateLedgerKeys,
  sumLedgerBalance,
  withdrawTotalDebit,
  WITHDRAW_IDEMPOTENCY_SCOPE,
} from './e2e-db-assertions';
import {
  assertReconciliationConsistentWithRetry,
  bootstrapConcurrencyHarness,
  createWalletAndDeposit,
  PARALLEL_COUNT,
  postWithdrawResilient,
  teardownConcurrencyHarness,
  type ConcurrencyHarness,
} from './concurrency.harness';
import { e2eHttpConcurrencyLimit, mapWithConcurrencyLimit } from './parallel-http.util';

const CASO_B_AMOUNT = 1;
const CASO_B_DEPOSIT = 500;

describe('E2E concurrency CASO B — keys distintas wd-1..wd-N (75 paralelos)', () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await bootstrapConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await teardownConcurrencyHarness(harness);
  });

  it('serializa retiros sin doble deducción ni ledger duplicado', async () => {
    const keys = Array.from(
      { length: PARALLEL_COUNT },
      (_, i) => `wd-${i + 1}-${randomUUID()}`,
    );
    const walletId = await createWalletAndDeposit(harness, CASO_B_DEPOSIT);
    const initialBalance = new Prisma.Decimal(CASO_B_DEPOSIT);
    const perWithdrawDebit = withdrawTotalDebit(CASO_B_AMOUNT).total;
    const testStartedAt = new Date();

    const results = await mapWithConcurrencyLimit(
      keys,
      e2eHttpConcurrencyLimit(),
      (key) =>
        postWithdrawResilient(harness, walletId, CASO_B_AMOUNT, key),
    );

    const unexpectedStatuses = results
      .map((r) => r.status)
      .filter((s) => s !== 201 && s !== 409 && s !== 422 && s !== 503);
    expect(unexpectedStatuses).toEqual([]);

    const outcomes = results.map((r, index) => ({ r, key: keys[index]! }));
    const completedPairs = outcomes.filter(({ r }) => r.status === 201);
    const completedCount = completedPairs.length;
    const completedKeys = completedPairs.map(({ key }) => key);

    expect(completedCount).toBeGreaterThanOrEqual(1);
    expect(completedCount).toBeLessThanOrEqual(PARALLEL_COUNT);

    expect(
      await countCompletedIdempotencyByKeys(harness.prisma, completedKeys),
    ).toBe(completedCount);

    for (const key of completedKeys) {
      expect(await countIdempotencyRowsByKey(harness.prisma, key)).toBe(1);
    }

    expect(
      await harness.prisma.idempotencyKey.count({
        where: {
          scope: WITHDRAW_IDEMPOTENCY_SCOPE,
          key: { in: completedKeys },
        },
      }),
    ).toBe(completedCount);

    expect(
      await countWithdrawLedgerEntries(harness.prisma, walletId, testStartedAt),
    ).toBe(completedCount);
    expect(
      await findDuplicateLedgerKeys(harness.prisma, walletId, testStartedAt),
    ).toHaveLength(0);

    const wallet = await harness.prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(wallet.currentBalance.gte(0)).toBe(true);

    const maxPossible = initialBalance.div(perWithdrawDebit).floor().toNumber();
    expect(completedCount).toBeLessThanOrEqual(maxPossible);

    const expectedFinal = initialBalance.sub(
      perWithdrawDebit.mul(completedCount),
    );
    expect(wallet.currentBalance.toFixed(2)).toBe(expectedFinal.toFixed(2));

    const ledgerBalance = await sumLedgerBalance(harness.prisma, walletId);
    expect(ledgerBalance.toFixed(2)).toBe(wallet.currentBalance.toFixed(2));

    const feePerUnit = calculateFee(
      FeeableOperation.WITHDRAW,
      new Prisma.Decimal(CASO_B_AMOUNT),
    );
    expect(
      initialBalance
        .sub(new Prisma.Decimal(CASO_B_AMOUNT).mul(completedCount))
        .sub(feePerUnit.mul(completedCount))
        .toFixed(2),
    ).toBe(wallet.currentBalance.toFixed(2));

    await assertNoNegativeBalances(harness.prisma, [walletId]);
    await assertLedgerMatchesProjection(harness.prisma, walletId);
    await assertReconciliationConsistentWithRetry(harness, walletId);
  }, 180_000);
});
