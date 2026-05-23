import { IdempotencyStatus, OperationType, Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../src/modules/reconciliation/repositories/ledger-signed-amount.sql';
import { calculateFee, FeeableOperation } from '../../src/modules/fees/fee.policy';

export const WITHDRAW_IDEMPOTENCY_SCOPE = 'wallet.withdraw';

export async function sumLedgerBalance(
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

export async function assertNoNegativeBalances(
  prisma: PrismaService,
  walletIds: string[],
): Promise<void> {
  const negative = await prisma.wallet.findMany({
    where: {
      id: { in: walletIds },
      currentBalance: { lt: 0 },
    },
    select: { id: true, currentBalance: true },
  });
  expect(negative).toHaveLength(0);
}

/** Violación del índice ledger_entries_group_op_wallet_uidx */
export async function findDuplicateLedgerKeys(
  prisma: PrismaService,
  walletId: string,
  since?: Date,
): Promise<
  { transactionGroupId: string; operationType: string; walletId: string; count: bigint }[]
> {
  const sinceFilter = since
    ? Prisma.sql`AND "createdAt" >= ${since}`
    : Prisma.empty;

  return prisma.$queryRaw`
    SELECT
      "transactionGroupId",
      "operationType"::text AS "operationType",
      "walletId",
      COUNT(*)::bigint AS count
    FROM ledger_entries
    WHERE "walletId" = ${walletId}
      AND "transactionGroupId" IS NOT NULL
      ${sinceFilter}
    GROUP BY "transactionGroupId", "operationType", "walletId"
    HAVING COUNT(*) > 1
  `;
}

export async function countWithdrawLedgerEntries(
  prisma: PrismaService,
  walletId: string,
  since?: Date,
): Promise<number> {
  return prisma.ledgerEntry.count({
    where: {
      walletId,
      operationType: OperationType.WITHDRAW,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
}

export async function countCompletedIdempotencyByKeys(
  prisma: PrismaService,
  keys: string[],
): Promise<number> {
  return prisma.idempotencyKey.count({
    where: {
      scope: WITHDRAW_IDEMPOTENCY_SCOPE,
      key: { in: keys },
      status: IdempotencyStatus.COMPLETED,
    },
  });
}

export async function countIdempotencyRowsByKey(
  prisma: PrismaService,
  key: string,
): Promise<number> {
  return prisma.idempotencyKey.count({
    where: { scope: WITHDRAW_IDEMPOTENCY_SCOPE, key },
  });
}

export function withdrawTotalDebit(
  baseAmount: number,
): { fee: Prisma.Decimal; total: Prisma.Decimal } {
  const base = new Prisma.Decimal(baseAmount);
  const fee = calculateFee(FeeableOperation.WITHDRAW, base);
  return { fee, total: base.add(fee) };
}

export async function assertReconciliationConsistent(
  httpServer: Parameters<typeof request>[0],
  walletId: string,
): Promise<void> {
  const res = await request(httpServer)
    .get(`/api/reconciliation/wallets/${walletId}`)
    .expect(200);
  expect(res.body.data.isConsistent).toBe(true);
  expect(res.body.data.difference).toBe('0.00');
}

export async function assertLedgerMatchesProjection(
  prisma: PrismaService,
  walletId: string,
): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
  });
  const ledger = await sumLedgerBalance(prisma, walletId);
  expect(wallet.currentBalance.toFixed(2)).toBe(ledger.toFixed(2));
}
