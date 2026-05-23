/**
 * RIESGO R4 / R15 — API de consulta (GET) desincronizada respecto al ledger.
 * POR QUÉ: El usuario y el ops-console confían en currentBalance y movimientos;
 *          un bug aquí no mueve dinero pero genera decisiones erróneas.
 * ÉXITO: Tras deposit + withdraw, GET wallet y movements coinciden con ledger y reconciliación.
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';
import { assertReconciliationConsistent } from './e2e-db-assertions';
import {
  bootstrapConcurrencyHarness,
  createWalletAndDeposit,
  teardownConcurrencyHarness,
  type ConcurrencyHarness,
} from './concurrency.harness';

const DEPOSIT = 100;
const WITHDRAW = 25;
const WITHDRAW_FEE = calculateFee(
  FeeableOperation.WITHDRAW,
  new Prisma.Decimal(WITHDRAW),
);
const EXPECTED_BALANCE = new Prisma.Decimal(DEPOSIT)
  .sub(WITHDRAW)
  .sub(WITHDRAW_FEE);

describe('E2E wallet read API — saldo y movimientos', () => {
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    harness = await bootstrapConcurrencyHarness();
  }, 60_000);

  afterAll(async () => {
    await teardownConcurrencyHarness(harness);
  });

  it('expone saldo y historial coherentes tras operaciones', async () => {
    const walletId = await createWalletAndDeposit(harness, DEPOSIT);

    await request(harness.httpServer)
      .post(`/api/wallets/${walletId}/withdraw`)
      .set('Idempotency-Key', `e2e-read-wd-${randomUUID()}`)
      .send({ amount: WITHDRAW })
      .expect(201);

    const expected = EXPECTED_BALANCE.toFixed(2);

    const walletGet = await request(harness.httpServer)
      .get(`/api/wallets/${walletId}`)
      .expect(200);

    expect(walletGet.body.data.id).toBe(walletId);
    expect(walletGet.body.data.currentBalance).toBe(expected);
    expect(walletGet.body.data.ledgerBalance).toBe(expected);
    expect(walletGet.body.data.isConsistent).toBe(true);

    const movementsRes = await request(harness.httpServer)
      .get(`/api/wallets/${walletId}/movements`)
      .query({ limit: 10 })
      .expect(200);

    expect(movementsRes.body.data.walletId).toBe(walletId);
    expect(movementsRes.body.data.movements.length).toBeGreaterThanOrEqual(2);

    const types = movementsRes.body.data.movements.map(
      (m: { operationType: string }) => m.operationType,
    );
    expect(types).toContain('DEPOSIT');
    expect(types).toContain('WITHDRAW');

    await assertReconciliationConsistent(harness.httpServer, walletId);
  }, 60_000);
});
