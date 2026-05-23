/**
 * Examen fintech — conservación global de dinero.
 * Requiere PostgreSQL (DATABASE_URL). Escenario determinista vía API real.
 */
import '../e2e/e2e-env';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';
import { ReconciliationRepository } from '../../src/modules/reconciliation/repositories/reconciliation.repository';
import { sumLedgerBalance } from '../e2e/e2e-db-assertions';
import { createE2eApp } from '../e2e/setup-e2e-app';
import { maybeResetFinancialTestDatabase } from '../support/test-db-bootstrap';
import {
  assertMoneyEquality,
  assertZeroDrift,
  captureGlobalMoneySnapshot,
  findSystemFeeWallet,
  listWalletIdsWithLedgerActivity,
} from './money-integrity-audit.util';

const SCENARIO = {
  deposit: 2_000,
  transfer: 200,
  withdraw: 100,
} as const;

const TRANSFER_FEE = calculateFee(
  FeeableOperation.TRANSFER,
  new Prisma.Decimal(SCENARIO.transfer),
);
const WITHDRAW_FEE = calculateFee(
  FeeableOperation.WITHDRAW,
  new Prisma.Decimal(SCENARIO.withdraw),
);
const SCENARIO_FEES = TRANSFER_FEE.add(WITHDRAW_FEE);

function idempotencyKey(label: string): string {
  return `audit-${label}-${randomUUID()}`;
}

describe('Money integrity audit (global conservation)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let reconciliationRepository: ReconciliationRepository;
  let httpServer: Parameters<typeof request>[0];

  let walletAId: string;
  let walletBId: string;
  let systemFeeWalletId: string;

  let baseline: Awaited<ReturnType<typeof captureGlobalMoneySnapshot>>;
  let systemFeeBaseline: Prisma.Decimal;
  let systemFeeLedgerBaseline: Prisma.Decimal;

  beforeAll(async () => {
    await maybeResetFinancialTestDatabase();
    const ctx = await createE2eApp({
      disableThrottler: true,
      disableRiskGuard: true,
    });
    app = ctx.app;
    prisma = ctx.module.get(PrismaService);
    reconciliationRepository = ctx.module.get(ReconciliationRepository);
    httpServer = app.getHttpServer();

    const systemFee = await findSystemFeeWallet(prisma);
    if (!systemFee) {
      throw new Error('SYSTEM_FEE wallet missing — run migrations');
    }
    systemFeeWalletId = systemFee.id;
    systemFeeBaseline = systemFee.currentBalance;
    systemFeeLedgerBaseline = await sumLedgerBalance(prisma, systemFeeWalletId);

    baseline = await captureGlobalMoneySnapshot(prisma);
    assertZeroDrift('pre-flight (sistema completo antes del escenario)', baseline);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('ejecuta escenario determinista y conserva dinero a nivel global', async () => {
    const walletARes = await request(httpServer)
      .post('/api/wallets')
      .send({ currency: 'USD' })
      .expect(201);
    walletAId = walletARes.body.data.id as string;

    const walletBRes = await request(httpServer)
      .post('/api/wallets')
      .send({ currency: 'USD' })
      .expect(201);
    walletBId = walletBRes.body.data.id as string;

    await request(httpServer)
      .post(`/api/wallets/${walletAId}/deposit`)
      .set('Idempotency-Key', idempotencyKey('deposit'))
      .send({ amount: SCENARIO.deposit })
      .expect(201);

    await request(httpServer)
      .post('/api/wallets/transfer')
      .set('Idempotency-Key', idempotencyKey('transfer'))
      .send({
        fromWalletId: walletAId,
        toWalletId: walletBId,
        amount: SCENARIO.transfer,
      })
      .expect(201);

    await request(httpServer)
      .post(`/api/wallets/${walletAId}/withdraw`)
      .set('Idempotency-Key', idempotencyKey('withdraw'))
      .send({ amount: SCENARIO.withdraw })
      .expect(201);

    const end = await captureGlobalMoneySnapshot(prisma);

    const projectionDelta = end.totalProjection.sub(baseline.totalProjection);
    const ledgerDelta = end.totalLedgerSigned.sub(baseline.totalLedgerSigned);

    assertMoneyEquality(
      'delta proyección vs delta ledger (escenario)',
      projectionDelta,
      ledgerDelta,
    );

    assertZeroDrift('post-escenario (sistema completo)', end);

    const expectedNetToUserWallets = new Prisma.Decimal(SCENARIO.deposit)
      .sub(SCENARIO.transfer)
      .sub(TRANSFER_FEE)
      .sub(SCENARIO.withdraw)
      .sub(WITHDRAW_FEE)
      .add(SCENARIO.transfer);

    const userProjectionDelta = end.userWalletsProjection.sub(
      baseline.userWalletsProjection,
    );
    assertMoneyEquality(
      'delta wallets USER del escenario',
      userProjectionDelta,
      expectedNetToUserWallets,
    );

    const systemFee = await prisma.wallet.findUniqueOrThrow({
      where: { id: systemFeeWalletId },
    });
    const systemFeeDelta = systemFee.currentBalance.sub(systemFeeBaseline);
    assertMoneyEquality(
      'fees acumulados en SYSTEM_FEE',
      systemFeeDelta,
      SCENARIO_FEES,
    );

    assertMoneyEquality(
      'FEE_IN global = FEE_OUT global (sin pérdida de comisiones)',
      end.totalFeeIn,
      end.totalFeeOut,
    );

    const systemFeeLedger = await sumLedgerBalance(prisma, systemFeeWalletId);
    assertMoneyEquality(
      'SYSTEM_FEE projection = ledger signed',
      systemFee.currentBalance,
      systemFeeLedger,
    );

    assertMoneyEquality(
      'SYSTEM_FEE ledger delta del escenario',
      systemFeeLedger.sub(systemFeeLedgerBaseline),
      SCENARIO_FEES,
    );

    assertMoneyEquality(
      'SUM(wallets USER) + SYSTEM_FEE = SUM(wallets total)',
      end.userWalletsProjection.add(end.systemFeeProjection),
      end.totalProjection,
    );

    const walletA = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletAId },
    });
    const walletB = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletBId },
    });

    const expectedA = new Prisma.Decimal(SCENARIO.deposit)
      .sub(SCENARIO.transfer)
      .sub(TRANSFER_FEE)
      .sub(SCENARIO.withdraw)
      .sub(WITHDRAW_FEE);
    const expectedB = new Prisma.Decimal(SCENARIO.transfer);

    expect(walletA.currentBalance.toFixed(2)).toBe(expectedA.toFixed(2));
    expect(walletB.currentBalance.toFixed(2)).toBe(expectedB.toFixed(2));
    expect(walletA.currentBalance.gte(0)).toBe(true);
    expect(walletB.currentBalance.gte(0)).toBe(true);

    const touchedWallets = [walletAId, walletBId, systemFeeWalletId];
    for (const walletId of touchedWallets) {
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: walletId },
      });
      const { balance: ledgerBalance } =
        await reconciliationRepository.resolveLedgerBalance(walletId, {
          allowMvFastPath: false,
        });

      expect(wallet.currentBalance.toFixed(2)).toBe(ledgerBalance.toFixed(2));

      const api = await request(httpServer)
        .get(`/api/reconciliation/wallets/${walletId}`)
        .expect(200);

      expect(api.body.data.isConsistent).toBe(true);
      expect(api.body.data.difference).toBe('0.00');
    }
  }, 120_000);

  it('reconciliación individual = true para cada wallet con actividad en ledger', async () => {
    const walletIds = await listWalletIdsWithLedgerActivity(prisma);
    expect(walletIds.length).toBeGreaterThan(0);

    const drifts: { walletId: string; difference: string }[] = [];

    for (const walletId of walletIds) {
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { id: walletId },
      });
      const { balance: ledgerBalance } =
        await reconciliationRepository.resolveLedgerBalance(walletId, {
          allowMvFastPath: false,
        });

      const difference = wallet.currentBalance.sub(ledgerBalance);
      if (!difference.eq(0)) {
        drifts.push({
          walletId,
          difference: difference.toFixed(2),
        });
      }

      const api = await request(httpServer)
        .get(`/api/reconciliation/wallets/${walletId}`)
        .expect(200);

      expect(api.body.data.isConsistent).toBe(true);
    }

    expect(drifts).toEqual([]);
  }, 120_000);
});
