import { INestApplication } from '@nestjs/common';
import { Prisma, WalletKind } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../src/modules/reconciliation/repositories/ledger-signed-amount.sql';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';
import { maybeResetFinancialTestDatabase } from '../support/test-db-bootstrap';
import { createE2eApp } from './setup-e2e-app';

/**
 * RIESGO R4–R6, R9, R11, R15 — Flujo financiero HTTP completo (smoke de producción).
 * Matriz riesgo → test: tests-risks.md
 */

const DEPOSIT_AMOUNT = 100;
const TRANSFER_AMOUNT = 30;
const WITHDRAW_AMOUNT = 20;

const TRANSFER_FEE = calculateFee(
  FeeableOperation.TRANSFER,
  new Prisma.Decimal(TRANSFER_AMOUNT),
);
const WITHDRAW_FEE = calculateFee(
  FeeableOperation.WITHDRAW,
  new Prisma.Decimal(WITHDRAW_AMOUNT),
);
const TOTAL_FEES = TRANSFER_FEE.add(WITHDRAW_FEE);

const ORIGIN_FINAL_BALANCE = new Prisma.Decimal(DEPOSIT_AMOUNT)
  .sub(TRANSFER_AMOUNT)
  .sub(TRANSFER_FEE)
  .sub(WITHDRAW_AMOUNT)
  .sub(WITHDRAW_FEE);

const DESTINATION_FINAL_BALANCE = new Prisma.Decimal(TRANSFER_AMOUNT);

function idempotencyKey(label: string): string {
  return `e2e-${label}-${randomUUID()}`;
}

async function sumLedgerBalance(
  prisma: PrismaService,
  walletId: string,
): Promise<Prisma.Decimal> {
  const signedAmount = ledgerSignedAmountExpression();
  const rows = await prisma.$queryRaw<{ balance: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(${signedAmount}), 0)::decimal(18, 2) AS balance
    FROM ledger_entries
    WHERE "walletId" = ${walletId}
  `;
  return new Prisma.Decimal(rows[0]?.balance ?? 0);
}

async function sumFeeInLedger(
  prisma: PrismaService,
  range: { start: Date; end: Date },
  currency = 'USD',
): Promise<Prisma.Decimal> {
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS total
    FROM ledger_entries le
    INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
    WHERE le."operationType" = 'FEE_IN'::"OperationType"
      AND tg.status = 'COMPLETED'::"TransactionGroupStatus"
      AND le."createdAt" >= ${range.start}
      AND le."createdAt" < ${range.end}
      AND le.currency = ${currency}
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

async function sumFeeInForTransactionGroups(
  prisma: PrismaService,
  transactionGroupIds: string[],
): Promise<Prisma.Decimal> {
  if (transactionGroupIds.length === 0) {
    return new Prisma.Decimal(0);
  }
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(amount), 0)::decimal(18, 2) AS total
    FROM ledger_entries
    WHERE "operationType" = 'FEE_IN'::"OperationType"
      AND "transactionGroupId" IN (${Prisma.join(transactionGroupIds)})
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

describe('E2E financial flow (real API)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let testRangeStart: Date;
  let testRangeEnd: Date;

  let originWalletId: string;
  let destinationWalletId: string;
  let systemFeeWalletId: string;
  let systemFeeBalanceBefore: Prisma.Decimal;

  let transferGroupId: string;
  let withdrawGroupId: string;

  beforeAll(async () => {
    await maybeResetFinancialTestDatabase();
    const ctx = await createE2eApp();
    app = ctx.app;
    prisma = ctx.module.get(PrismaService);

    const systemFeeWallet = await prisma.wallet.findFirst({
      where: { kind: WalletKind.SYSTEM_FEE, currency: 'USD' },
    });
    if (!systemFeeWallet) {
      throw new Error('SYSTEM_FEE wallet (USD) not found — run migrations and app bootstrap');
    }
    systemFeeWalletId = systemFeeWallet.id;
    systemFeeBalanceBefore = systemFeeWallet.currentBalance;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('runs full deposit → transfer → withdraw flow with financial invariants', async () => {
    testRangeStart = new Date();

    // --- 1. Wallets + deposit 100 USD on origin ---
    const originCreate = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ currency: 'USD' })
      .expect(201);

    originWalletId = originCreate.body.data.id as string;

    const destCreate = await request(app.getHttpServer())
      .post('/api/wallets')
      .send({ currency: 'USD' })
      .expect(201);

    destinationWalletId = destCreate.body.data.id as string;

    const depositRes = await request(app.getHttpServer())
      .post(`/api/wallets/${originWalletId}/deposit`)
      .set('Idempotency-Key', idempotencyKey('deposit'))
      .set('x-request-id', idempotencyKey('corr-deposit'))
      .send({ amount: DEPOSIT_AMOUNT })
      .expect(201);

    expect(depositRes.body.data.amount).toBe('100.00');
    expect(depositRes.body.data.balanceAfter).toBe('100.00');
    expect(depositRes.body.data.walletId).toBe(originWalletId);

    // --- 2. Transfer 30 USD ---
    const transferRes = await request(app.getHttpServer())
      .post('/api/wallets/transfer')
      .set('Idempotency-Key', idempotencyKey('transfer'))
      .set('x-request-id', idempotencyKey('corr-transfer'))
      .send({
        fromWalletId: originWalletId,
        toWalletId: destinationWalletId,
        amount: TRANSFER_AMOUNT,
      })
      .expect(201);

    transferGroupId = transferRes.body.data.transferId as string;

    expect(transferRes.body.data.amount).toBe('30.00');
    expect(transferRes.body.data.feeAmount).toBe(TRANSFER_FEE.toFixed(2));
    expect(transferRes.body.data.totalDeducted).toBe(
      new Prisma.Decimal(TRANSFER_AMOUNT).add(TRANSFER_FEE).toFixed(2),
    );
    expect(transferRes.body.data.toBalanceAfter).toBe('30.00');

    // --- 3. Withdraw 20 USD from origin ---
    const withdrawRes = await request(app.getHttpServer())
      .post(`/api/wallets/${originWalletId}/withdraw`)
      .set('Idempotency-Key', idempotencyKey('withdraw'))
      .set('x-request-id', idempotencyKey('corr-withdraw'))
      .send({ amount: WITHDRAW_AMOUNT })
      .expect(201);

    withdrawGroupId = withdrawRes.body.data.withdrawId as string;

    expect(withdrawRes.body.data.amount).toBe('20.00');
    expect(withdrawRes.body.data.feeAmount).toBe(WITHDRAW_FEE.toFixed(2));
    expect(withdrawRes.body.data.totalDeducted).toBe(
      new Prisma.Decimal(WITHDRAW_AMOUNT).add(WITHDRAW_FEE).toFixed(2),
    );

    testRangeEnd = new Date();

    // --- 4. Fee assertions (API + ledger groups) ---
    const feesFromOurGroups = await sumFeeInForTransactionGroups(prisma, [
      transferGroupId,
      withdrawGroupId,
    ]);
    expect(feesFromOurGroups.toFixed(2)).toBe(TOTAL_FEES.toFixed(2));

    const systemFeeWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: systemFeeWalletId },
    });
    const systemFeeDelta = systemFeeWallet.currentBalance.sub(systemFeeBalanceBefore);
    expect(systemFeeDelta.toFixed(2)).toBe(TOTAL_FEES.toFixed(2));

    // --- 5. Wallet projection balances ---
    const originWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: originWalletId },
    });
    const destWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: destinationWalletId },
    });

    expect(originWallet.currentBalance.toFixed(2)).toBe(
      ORIGIN_FINAL_BALANCE.toFixed(2),
    );
    expect(destWallet.currentBalance.toFixed(2)).toBe(
      DESTINATION_FINAL_BALANCE.toFixed(2),
    );

    // 50 USD principal moved out (30 + 20), minus fees
    const principalOut = new Prisma.Decimal(TRANSFER_AMOUNT).add(WITHDRAW_AMOUNT);
    expect(
      new Prisma.Decimal(DEPOSIT_AMOUNT).sub(principalOut).sub(TOTAL_FEES).toFixed(2),
    ).toBe(ORIGIN_FINAL_BALANCE.toFixed(2));

    // --- Ledger sum vs projection ---
    const originLedger = await sumLedgerBalance(prisma, originWalletId);
    const destLedger = await sumLedgerBalance(prisma, destinationWalletId);
    const systemFeeLedger = await sumLedgerBalance(prisma, systemFeeWalletId);

    expect(originLedger.toFixed(2)).toBe(originWallet.currentBalance.toFixed(2));
    expect(destLedger.toFixed(2)).toBe(destWallet.currentBalance.toFixed(2));
    expect(systemFeeLedger.toFixed(2)).toBe(
      systemFeeWallet.currentBalance.toFixed(2),
    );

    // --- 6. GET wallet + movements ---
    const walletGet = await request(app.getHttpServer())
      .get(`/api/wallets/${originWalletId}`)
      .expect(200);

    expect(walletGet.body.data.id).toBe(originWalletId);
    expect(walletGet.body.data.currentBalance).toBe(
      ORIGIN_FINAL_BALANCE.toFixed(2),
    );
    expect(walletGet.body.data.ledgerBalance).toBe(
      ORIGIN_FINAL_BALANCE.toFixed(2),
    );
    expect(walletGet.body.data.isConsistent).toBe(true);

    const movementsRes = await request(app.getHttpServer())
      .get(`/api/wallets/${originWalletId}/movements`)
      .query({ limit: 20 })
      .expect(200);

    expect(movementsRes.body.data.walletId).toBe(originWalletId);
    expect(movementsRes.body.data.movements.length).toBeGreaterThanOrEqual(3);

    const operationTypes = movementsRes.body.data.movements.map(
      (m: { operationType: string }) => m.operationType,
    );
    expect(operationTypes).toContain('DEPOSIT');
    expect(operationTypes).toContain('WITHDRAW');

    // --- 7. Reconciliation (both wallets) ---
    const reconOrigin = await request(app.getHttpServer())
      .get(`/api/reconciliation/wallets/${originWalletId}`)
      .expect(200);

    expect(reconOrigin.body.data.isConsistent).toBe(true);
    expect(reconOrigin.body.data.ledgerBalance).toBe(
      ORIGIN_FINAL_BALANCE.toFixed(2),
    );
    expect(reconOrigin.body.data.projectionBalance).toBe(
      ORIGIN_FINAL_BALANCE.toFixed(2),
    );

    const reconDest = await request(app.getHttpServer())
      .get(`/api/reconciliation/wallets/${destinationWalletId}`)
      .expect(200);

    expect(reconDest.body.data.isConsistent).toBe(true);
    expect(reconDest.body.data.ledgerBalance).toBe('30.00');

    // --- 8. P&L vs ledger FEE_IN (test window) ---
    const ledgerFeeTotal = await sumFeeInLedger(prisma, {
      start: testRangeStart,
      end: testRangeEnd,
    });

    const pnlRes = await request(app.getHttpServer())
      .get('/api/reporting/pnl')
      .query({
        startDate: testRangeStart.toISOString(),
        endDate: testRangeEnd.toISOString(),
        currency: 'USD',
      })
      .expect(200);

    expect(pnlRes.body.data.totalRevenue).toBe(ledgerFeeTotal.toFixed(2));
    expect(ledgerFeeTotal.toFixed(2)).toBe(TOTAL_FEES.toFixed(2));
    expect(pnlRes.body.data.totalRevenue).toBe(TOTAL_FEES.toFixed(2));
    expect(feesFromOurGroups.toFixed(2)).toBe(TOTAL_FEES.toFixed(2));
  }, 120_000);
});
