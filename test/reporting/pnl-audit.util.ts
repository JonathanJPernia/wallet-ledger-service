import { Prisma, TransactionGroupStatus } from '@prisma/client';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service';

export type LedgerFeeBreakdownRow = {
  sourceType: string;
  revenue: Prisma.Decimal;
};

export async function sumFeeInFromLedgerSql(
  prisma: PrismaService,
  range: { startDate: Date; endDate: Date; currency: string },
): Promise<Prisma.Decimal> {
  const currency = range.currency.toUpperCase();
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS total
    FROM ledger_entries le
    INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
    WHERE le."operationType" = 'FEE_IN'::"OperationType"
      AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
      AND le."createdAt" >= ${range.startDate}
      AND le."createdAt" < ${range.endDate}
      AND le.currency = ${currency}
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

export async function feeBreakdownFromLedgerSql(
  prisma: PrismaService,
  range: { startDate: Date; endDate: Date; currency: string },
): Promise<LedgerFeeBreakdownRow[]> {
  const currency = range.currency.toUpperCase();
  return prisma.$queryRaw<LedgerFeeBreakdownRow[]>`
    SELECT
      tg.type::text AS "sourceType",
      COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS revenue
    FROM ledger_entries le
    INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
    WHERE le."operationType" = 'FEE_IN'::"OperationType"
      AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
      AND le."createdAt" >= ${range.startDate}
      AND le."createdAt" < ${range.endDate}
      AND le.currency = ${currency}
    GROUP BY tg.type
  `;
}

export function breakdownToMap(rows: LedgerFeeBreakdownRow[]): Record<string, string> {
  const map: Record<string, string> = {
    TRANSFER: '0.00',
    WITHDRAW: '0.00',
    DEPOSIT: '0.00',
  };
  for (const row of rows) {
    map[row.sourceType] = new Prisma.Decimal(row.revenue).toFixed(2);
  }
  return map;
}
