/**
 * STEP 4 — P&L vs ledger (sin mocks, API + SQL + repository).
 */
import '../e2e/e2e-env';
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';
import { ReportingRepository } from '../../src/modules/reporting/repositories/reporting.repository';
import { PnlService } from '../../src/modules/reporting/services/pnl.service';
import { resolveReportingRange } from '../../src/modules/reporting/utils/reporting-date.util';
import { createE2eApp } from '../e2e/setup-e2e-app';
import { maybeResetFinancialTestDatabase } from '../support/test-db-bootstrap';
import {
  assertZeroDrift,
  captureGlobalMoneySnapshot,
} from '../audit/money-integrity-audit.util';
import {
  breakdownToMap,
  feeBreakdownFromLedgerSql,
  sumFeeInFromLedgerSql,
} from './pnl-audit.util';

const CURRENCY = 'USD';
const DEPOSIT_AMOUNT = 500;
const TRANSFER_AMOUNT = 200;
const WITHDRAW_AMOUNT = 100;

const EXPECTED_TRANSFER_FEE = calculateFee(
  FeeableOperation.TRANSFER,
  new Prisma.Decimal(TRANSFER_AMOUNT),
);
const EXPECTED_WITHDRAW_FEE = calculateFee(
  FeeableOperation.WITHDRAW,
  new Prisma.Decimal(WITHDRAW_AMOUNT),
);
const EXPECTED_TOTAL_FEES = EXPECTED_TRANSFER_FEE.add(EXPECTED_WITHDRAW_FEE);

function idempotencyKey(label: string): string {
  return `pnl-${label}-${randomUUID()}`;
}

describe('Reporting P&L validation (ledger source of truth)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let reportingRepository: ReportingRepository;
  let pnlService: PnlService;
  let httpServer: Parameters<typeof request>[0];

  let testRangeStart: Date;
  let testRangeEnd: Date;
  let transferGroupId: string;
  let withdrawGroupId: string;

  beforeAll(async () => {
    await maybeResetFinancialTestDatabase();
    const ctx = await createE2eApp({
      disableThrottler: true,
      disableRiskGuard: true,
    });
    app = ctx.app;
    prisma = ctx.module.get(PrismaService);
    reportingRepository = ctx.module.get(ReportingRepository);
    pnlService = ctx.module.get(PnlService);
    httpServer = app.getHttpServer();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('P&L API coincide con ledger, breakdown y rango del escenario', async () => {
    testRangeStart = new Date();

    const walletARes = await request(httpServer)
      .post('/api/wallets')
      .send({ currency: CURRENCY })
      .expect(201);
    const walletAId = walletARes.body.data.id as string;

    const walletBRes = await request(httpServer)
      .post('/api/wallets')
      .send({ currency: CURRENCY })
      .expect(201);
    const walletBId = walletBRes.body.data.id as string;

    await request(httpServer)
      .post(`/api/wallets/${walletAId}/deposit`)
      .set('Idempotency-Key', idempotencyKey('deposit'))
      .send({ amount: DEPOSIT_AMOUNT })
      .expect(201);

    const transferRes = await request(httpServer)
      .post('/api/wallets/transfer')
      .set('Idempotency-Key', idempotencyKey('transfer'))
      .send({
        fromWalletId: walletAId,
        toWalletId: walletBId,
        amount: TRANSFER_AMOUNT,
      })
      .expect(201);
    transferGroupId = transferRes.body.data.transferId as string;
    expect(transferRes.body.data.feeAmount).toBe(EXPECTED_TRANSFER_FEE.toFixed(2));

    const withdrawRes = await request(httpServer)
      .post(`/api/wallets/${walletAId}/withdraw`)
      .set('Idempotency-Key', idempotencyKey('withdraw'))
      .send({ amount: WITHDRAW_AMOUNT })
      .expect(201);
    withdrawGroupId = withdrawRes.body.data.withdrawId as string;
    expect(withdrawRes.body.data.feeAmount).toBe(EXPECTED_WITHDRAW_FEE.toFixed(2));

    testRangeEnd = new Date();

    const startIso = testRangeStart.toISOString();
    const endIso = testRangeEnd.toISOString();

    const range = {
      startDate: testRangeStart,
      endDate: testRangeEnd,
      currency: CURRENCY,
    };

    const resolved = resolveReportingRange('daily', startIso, endIso);
    expect(resolved.startDate.toISOString()).toBe(startIso);
    expect(resolved.endDate.toISOString()).toBe(endIso);

    const pnlApi = await request(httpServer)
      .get('/api/reporting/pnl')
      .query({
        period: 'daily',
        currency: CURRENCY,
        startDate: startIso,
        endDate: endIso,
      })
      .expect(200);

    const pnl = pnlApi.body.data;

    const ledgerTotalSql = await sumFeeInFromLedgerSql(prisma, range);
    const repositoryTotal = await reportingRepository.sumFeeRevenue(range);
    const repositoryWithSource =
      await reportingRepository.sumFeeRevenueWithSource(range);

    const pnlViaService = await pnlService.getPnl({
      period: 'daily',
      startDate: startIso,
      endDate: endIso,
      currency: CURRENCY,
    });

    const scenarioFeesOnly = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS total
      FROM ledger_entries le
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND le."transactionGroupId" IN (${transferGroupId}, ${withdrawGroupId})
        AND le."createdAt" >= ${testRangeStart}
        AND le."createdAt" < ${testRangeEnd}
        AND le.currency = ${CURRENCY}
    `;
    const feesInTestWindow = new Prisma.Decimal(scenarioFeesOnly[0]?.total ?? 0);

    expect(pnl.period).toBe('daily');
    expect(pnl.currency).toBe(CURRENCY);
    expect(pnl.startDate).toBe(startIso);
    expect(pnl.endDate).toBe(endIso);

    expect(pnl.totalRevenue).toBe(EXPECTED_TOTAL_FEES.toFixed(2));
    expect(pnl.netProfit).toBe(pnl.totalRevenue);
    expect(pnl.feeBreakdown.DEPOSIT).toBe('0.00');
    expect(pnl.feeBreakdown.TRANSFER).toBe(EXPECTED_TRANSFER_FEE.toFixed(2));
    expect(pnl.feeBreakdown.WITHDRAW).toBe(EXPECTED_WITHDRAW_FEE.toFixed(2));

    expect(pnl.totalRevenue).toBe(ledgerTotalSql.toFixed(2));
    expect(pnl.totalRevenue).toBe(repositoryTotal.toFixed(2));
    expect(pnl.totalRevenue).toBe(repositoryWithSource.total.toFixed(2));
    expect(pnlViaService.data.totalRevenue).toBe(pnl.totalRevenue);
    expect(pnlViaService.data.feeBreakdown).toEqual(pnl.feeBreakdown);

    expect(feesInTestWindow.toFixed(2)).toBe(EXPECTED_TOTAL_FEES.toFixed(2));
    expect(repositoryWithSource.dataSource).toBe('ledger');

    const sqlBreakdown = breakdownToMap(
      await feeBreakdownFromLedgerSql(prisma, range),
    );
    const repoBreakdownRows =
      await reportingRepository.feeBreakdownByGroupType(range);
    const repoBreakdown = breakdownToMap(repoBreakdownRows);

    expect(pnl.feeBreakdown).toEqual(sqlBreakdown);
    expect(pnl.feeBreakdown).toEqual(repoBreakdown);

    const depositFeeRows = await prisma.ledgerEntry.count({
      where: {
        operationType: 'FEE_IN',
        transactionGroup: { type: 'DEPOSIT' },
        createdAt: { gte: testRangeStart, lt: testRangeEnd },
        currency: CURRENCY,
      },
    });
    expect(depositFeeRows).toBe(0);

    const snapshot = await captureGlobalMoneySnapshot(prisma);
    assertZeroDrift('STEP 4 cierre: SUM(wallets) === SUM(ledger signed)', snapshot);
  }, 180_000);
});
