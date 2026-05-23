/**
 * RIESGO R1 / R16 — Doble retiro con la misma Idempotency-Key (“doble clic”).
 * POR QUÉ: Es el fallo más visible para el usuario; complementa CASO A (75 paralelos)
 *          con un escenario mínimo de 2 peticiones simultáneas.
 * ÉXITO: Ambas 201, un solo withdrawId, mismo balanceAfter, un solo movimiento WITHDRAW en ledger.
 */
import { IdempotencyStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  assertLedgerMatchesProjection,
  countIdempotencyRowsByKey,
  countWithdrawLedgerEntries,
} from './e2e-db-assertions';
import {
  assertReconciliationConsistentWithRetry,
  bootstrapConcurrencyHarness,
  createWalletAndDeposit,
  postWithdrawResilient,
  teardownConcurrencyHarness,
  type ConcurrencyHarness,
} from './concurrency.harness';

const DEPOSIT = 100;
const WITHDRAW = 20;
const SHARED_KEY = `e2e-dup-wd-${randomUUID()}`;

describe('E2E duplicate withdraw — misma key (2 paralelos)', () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await bootstrapConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await teardownConcurrencyHarness(harness);
  });

  it('aplica un solo débito ante dos POST concurrentes', async () => {
    const walletId = await createWalletAndDeposit(harness, DEPOSIT);
    const testStartedAt = new Date();

    const [first, second] = await Promise.all([
      postWithdrawResilient(harness, walletId, WITHDRAW, SHARED_KEY),
      postWithdrawResilient(harness, walletId, WITHDRAW, SHARED_KEY),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const bodyA = first.body.data;
    const bodyB = second.body.data;

    expect(bodyA.withdrawId).toBe(bodyB.withdrawId);
    expect(bodyA.balanceAfter).toBe(bodyB.balanceAfter);

    expect(await countIdempotencyRowsByKey(harness.prisma, SHARED_KEY)).toBe(1);
    expect(
      await countWithdrawLedgerEntries(harness.prisma, walletId, testStartedAt),
    ).toBe(1);

    const idempotency = await harness.prisma.idempotencyKey.findFirstOrThrow({
      where: { key: SHARED_KEY },
    });
    expect(idempotency.status).toBe(IdempotencyStatus.COMPLETED);

    await assertLedgerMatchesProjection(harness.prisma, walletId);
    await assertReconciliationConsistentWithRetry(harness, walletId);

    const wallet = await harness.prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(wallet.currentBalance.toFixed(2)).toBe(bodyA.balanceAfter);
  }, 60_000);
});
