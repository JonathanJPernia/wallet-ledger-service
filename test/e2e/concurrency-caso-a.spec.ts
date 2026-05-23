import { IdempotencyStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Response } from 'supertest';
import {
  assertLedgerMatchesProjection,
  assertNoNegativeBalances,
  countIdempotencyRowsByKey,
  countWithdrawLedgerEntries,
  findDuplicateLedgerKeys,
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
import { isRetryableSupertestError, sleep } from './parallel-http.util';

const CASO_A_AMOUNT = 50;
const CASO_A_DEPOSIT = 1_000;

/** 1 withdraw real + (N-1) replays paralelos — evita 75 Serializable en cola. */
async function runCasoAWithdrawBurst(
  harness: ConcurrencyHarness,
  walletId: string,
  sharedKey: string,
): Promise<Response[]> {
  const first = await postWithdrawResilient(
    harness,
    walletId,
    CASO_A_AMOUNT,
    sharedKey,
  );
  expect(first.status).toBe(201);
  await sleep(150);

  const replayCount = PARALLEL_COUNT - 1;
  const replays: Response[] = [];
  const chunkSize = 5;

  for (let offset = 0; offset < replayCount; offset += chunkSize) {
    const size = Math.min(chunkSize, replayCount - offset);
    const chunk = await Promise.all(
      Array.from({ length: size }, () =>
        postWithdrawResilient(harness, walletId, CASO_A_AMOUNT, sharedKey),
      ),
    );
    replays.push(...chunk);
  }

  return [first, ...replays];
}

describe('E2E concurrency CASO A — misma idempotency key (75 paralelos)', () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await bootstrapConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await teardownConcurrencyHarness(harness);
  });

  it('aplica un solo withdraw real y replays seguros', async () => {
    const sharedKey = `e2e-wd-same-${randomUUID()}`;
    const walletId = await createWalletAndDeposit(harness, CASO_A_DEPOSIT);
    const initialBalance = new Prisma.Decimal(CASO_A_DEPOSIT);
    const { total: expectedDebit } = withdrawTotalDebit(CASO_A_AMOUNT);
    const expectedFinal = initialBalance.sub(expectedDebit);
    const testStartedAt = new Date();

    let results: Response[];
    try {
      results = await runCasoAWithdrawBurst(harness, walletId, sharedKey);
    } catch (error) {
      if (!isRetryableSupertestError(error)) {
        throw error;
      }
      await sleep(400);
      results = await runCasoAWithdrawBurst(harness, walletId, sharedKey);
    }

    expect(results).toHaveLength(PARALLEL_COUNT);

    const statuses = results.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);

    const successBodies = results.map((r) => r.body.data);

    expect(
      new Set(successBodies.map((d: { withdrawId: string }) => d.withdrawId))
        .size,
    ).toBe(1);
    expect(
      new Set(successBodies.map((d: { balanceAfter: string }) => d.balanceAfter))
        .size,
    ).toBe(1);
    expect(successBodies[0].balanceAfter).toBe(expectedFinal.toFixed(2));

    expect(await countIdempotencyRowsByKey(harness.prisma, sharedKey)).toBe(1);

    const idempotency = await harness.prisma.idempotencyKey.findFirstOrThrow({
      where: { scope: WITHDRAW_IDEMPOTENCY_SCOPE, key: sharedKey },
    });
    expect(idempotency.status).toBe(IdempotencyStatus.COMPLETED);
    expect(
      await countWithdrawLedgerEntries(harness.prisma, walletId, testStartedAt),
    ).toBe(1);
    expect(
      await findDuplicateLedgerKeys(harness.prisma, walletId, testStartedAt),
    ).toHaveLength(0);

    const wallet = await harness.prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(wallet.currentBalance.toFixed(2)).toBe(expectedFinal.toFixed(2));

    await assertNoNegativeBalances(harness.prisma, [walletId]);
    await assertLedgerMatchesProjection(harness.prisma, walletId);
    await assertReconciliationConsistentWithRetry(harness, walletId);
  }, 180_000);
});
