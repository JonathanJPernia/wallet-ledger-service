import { Injectable } from '@nestjs/common';
import { Prisma, TransactionGroupStatus, type FinancialSnapshot } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../reconciliation/repositories/ledger-signed-amount.sql';
import { EXPORT_CHUNK_SIZE } from '../constants';
import type { DateRangeFilter } from '../reporting.types';

export type FeeBreakdownRow = {
  sourceType: string;
  revenue: Prisma.Decimal;
};

export type WalletActivityRow = {
  totalDeposits: Prisma.Decimal;
  totalWithdrawals: Prisma.Decimal;
  totalTransferIn: Prisma.Decimal;
  totalTransferOut: Prisma.Decimal;
  totalFeesOut: Prisma.Decimal;
};

export type SystemActivityRow = {
  transferCount: bigint;
  transferVolume: Prisma.Decimal;
  withdrawCount: bigint;
  withdrawVolume: Prisma.Decimal;
  depositCount: bigint;
  depositVolume: Prisma.Decimal;
  totalFeesCollected: Prisma.Decimal;
};

export type TopWalletVolumeRow = {
  walletId: string;
  volume: Prisma.Decimal;
  entryCount: bigint;
};

export type LedgerExportRow = {
  id: string;
  walletId: string;
  operationType: string;
  amount: Prisma.Decimal;
  currency: string;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  createdAt: Date;
  transactionGroupId: string | null;
  correlationId: string | null;
};

export type SnapshotTotalsRow = {
  totalSystemBalance: Prisma.Decimal;
  totalFeeRevenue: Prisma.Decimal;
  totalVolume: Prisma.Decimal;
};

@Injectable()
export class ReportingRepository {
  constructor(private readonly prisma: PrismaService) {}

  private currencyFilter(currency?: string) {
    return currency ? Prisma.sql`AND le.currency = ${currency.toUpperCase()}` : Prisma.empty;
  }

  async sumFeeRevenue(range: DateRangeFilter): Promise<Prisma.Decimal> {
    const { total } = await this.sumFeeRevenueWithSource(range);
    return total;
  }

  /**
   * P&L v2: MV para rangos cerrados en el pasado; ledger fallback si MV incompleto.
   */
  async sumFeeRevenueWithSource(range: DateRangeFilter): Promise<{
    total: Prisma.Decimal;
    dataSource: 'ledger' | 'mv';
  }> {
    const todayStart = this.utcTodayStart();
    if (range.endDate <= todayStart) {
      const mvTotal = await this.sumFeeRevenueFromMv(range);
      if (mvTotal !== null) {
        return { total: mvTotal, dataSource: 'mv' };
      }
    }

    const rows = await this.prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS total
      FROM ledger_entries le
      INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
        AND le."createdAt" >= ${range.startDate}
        AND le."createdAt" < ${range.endDate}
        ${this.currencyFilter(range.currency)}
    `;
    return {
      total: new Prisma.Decimal(rows[0]?.total ?? 0),
      dataSource: 'ledger',
    };
  }

  private async sumFeeRevenueFromMv(
    range: DateRangeFilter,
  ): Promise<Prisma.Decimal | null> {
    const currency = (range.currency ?? 'USD').toUpperCase();
    const rows = await this.prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM("totalFees"), 0)::decimal(18, 2) AS total
      FROM mv_daily_fee_revenue
      WHERE bucket_date >= ${range.startDate}::date
        AND bucket_date < ${range.endDate}::date
        AND currency = ${currency}
    `;
    const total = rows[0]?.total;
    if (total === undefined || total === null) {
      return null;
    }
    return new Prisma.Decimal(total);
  }

  private utcTodayStart(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  async feeBreakdownByGroupType(
    range: DateRangeFilter,
  ): Promise<FeeBreakdownRow[]> {
    return this.prisma.$queryRaw<FeeBreakdownRow[]>`
      SELECT
        tg.type::text AS "sourceType",
        COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS revenue
      FROM ledger_entries le
      INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
        AND le."createdAt" >= ${range.startDate}
        AND le."createdAt" < ${range.endDate}
        ${this.currencyFilter(range.currency)}
      GROUP BY tg.type
    `;
  }

  async getWalletActivity(
    walletId: string,
    range: DateRangeFilter,
  ): Promise<WalletActivityRow> {
    const rows = await this.prisma.$queryRaw<WalletActivityRow[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "operationType" = 'DEPOSIT' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalDeposits",
        COALESCE(SUM(CASE WHEN "operationType" = 'WITHDRAW' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalWithdrawals",
        COALESCE(SUM(CASE WHEN "operationType" = 'TRANSFER_IN' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalTransferIn",
        COALESCE(SUM(CASE WHEN "operationType" = 'TRANSFER_OUT' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalTransferOut",
        COALESCE(SUM(CASE WHEN "operationType" = 'FEE_OUT' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalFeesOut"
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
        AND "createdAt" >= ${range.startDate}
        AND "createdAt" < ${range.endDate}
        ${range.currency ? Prisma.sql`AND currency = ${range.currency.toUpperCase()}` : Prisma.empty}
    `;
    return (
      rows[0] ?? {
        totalDeposits: new Prisma.Decimal(0),
        totalWithdrawals: new Prisma.Decimal(0),
        totalTransferIn: new Prisma.Decimal(0),
        totalTransferOut: new Prisma.Decimal(0),
        totalFeesOut: new Prisma.Decimal(0),
      }
    );
  }

  async getSystemActivity(range: DateRangeFilter): Promise<SystemActivityRow> {
    const rows = await this.prisma.$queryRaw<SystemActivityRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "operationType" = 'TRANSFER_OUT') AS "transferCount",
        COALESCE(SUM(CASE WHEN "operationType" = 'TRANSFER_OUT' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "transferVolume",
        COUNT(*) FILTER (WHERE "operationType" = 'WITHDRAW') AS "withdrawCount",
        COALESCE(SUM(CASE WHEN "operationType" = 'WITHDRAW' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "withdrawVolume",
        COUNT(*) FILTER (WHERE "operationType" = 'DEPOSIT') AS "depositCount",
        COALESCE(SUM(CASE WHEN "operationType" = 'DEPOSIT' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "depositVolume",
        COALESCE(SUM(CASE WHEN "operationType" = 'FEE_IN' THEN amount ELSE 0 END), 0)::decimal(18, 2) AS "totalFeesCollected"
      FROM ledger_entries le
      WHERE le."createdAt" >= ${range.startDate}
        AND le."createdAt" < ${range.endDate}
        ${this.currencyFilter(range.currency)}
    `;
    return (
      rows[0] ?? {
        transferCount: BigInt(0),
        transferVolume: new Prisma.Decimal(0),
        withdrawCount: BigInt(0),
        withdrawVolume: new Prisma.Decimal(0),
        depositCount: BigInt(0),
        depositVolume: new Prisma.Decimal(0),
        totalFeesCollected: new Prisma.Decimal(0),
      }
    );
  }

  async getTopWalletsByVolume(
    range: DateRangeFilter,
    limit: number,
  ): Promise<TopWalletVolumeRow[]> {
    return this.prisma.$queryRaw<TopWalletVolumeRow[]>`
      SELECT
        "walletId",
        COALESCE(
          SUM(
            CASE
              WHEN "operationType" IN ('DEPOSIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAW')
              THEN amount
              ELSE 0
            END
          ),
          0
        )::decimal(18, 2) AS volume,
        COUNT(*) AS "entryCount"
      FROM ledger_entries
      WHERE "createdAt" >= ${range.startDate}
        AND "createdAt" < ${range.endDate}
        ${range.currency ? Prisma.sql`AND currency = ${range.currency.toUpperCase()}` : Prisma.empty}
      GROUP BY "walletId"
      ORDER BY volume DESC
      LIMIT ${limit}
    `;
  }

  async computeLedgerBalanceAsOf(
    walletId: string,
    asOf: Date,
  ): Promise<Prisma.Decimal> {
    const signedAmount = ledgerSignedAmountExpression();
    const rows = await this.prisma.$queryRaw<{ ledgerBalance: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(${signedAmount}), 0)::decimal(18, 2) AS "ledgerBalance"
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
        AND "createdAt" < ${asOf}
    `;
    return new Prisma.Decimal(rows[0]?.ledgerBalance ?? 0);
  }

  async computeSnapshotTotals(
    dayStart: Date,
    dayEnd: Date,
    currency: string,
  ): Promise<SnapshotTotalsRow> {
    const signedAmount = ledgerSignedAmountExpression();
    const rows = await this.prisma.$queryRaw<SnapshotTotalsRow[]>`
      SELECT
        COALESCE(
          (
            SELECT SUM(sub.bal)
            FROM (
              SELECT SUM(${signedAmount})::decimal(18, 2) AS bal
              FROM ledger_entries
              WHERE "createdAt" < ${dayEnd}
                AND currency = ${currency}
              GROUP BY "walletId"
            ) sub
          ),
          0
        )::decimal(18, 2) AS "totalSystemBalance",
        COALESCE(
          (
            SELECT SUM(le.amount)
            FROM ledger_entries le
            INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
            WHERE le."operationType" = 'FEE_IN'::"OperationType"
              AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
              AND le."createdAt" >= ${dayStart}
              AND le."createdAt" < ${dayEnd}
              AND le.currency = ${currency}
          ),
          0
        )::decimal(18, 2) AS "totalFeeRevenue",
        COALESCE(
          (
            SELECT SUM(amount)
            FROM ledger_entries
            WHERE "operationType" IN (
              'DEPOSIT'::"OperationType",
              'WITHDRAW'::"OperationType",
              'TRANSFER_OUT'::"OperationType"
            )
              AND "createdAt" >= ${dayStart}
              AND "createdAt" < ${dayEnd}
              AND currency = ${currency}
          ),
          0
        )::decimal(18, 2) AS "totalVolume"
    `;
    return (
      rows[0] ?? {
        totalSystemBalance: new Prisma.Decimal(0),
        totalFeeRevenue: new Prisma.Decimal(0),
        totalVolume: new Prisma.Decimal(0),
      }
    );
  }

  private toSnapshotDateOnly(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  async findFinancialSnapshot(
    snapshotDate: Date,
    currency: string,
  ): Promise<FinancialSnapshot | null> {
    return this.prisma.financialSnapshot.findUnique({
      where: {
        snapshotDate_currency: {
          snapshotDate: this.toSnapshotDateOnly(snapshotDate),
          currency: currency.toUpperCase(),
        },
      },
    });
  }

  /**
   * Insert-only: cierre contable congelado. Nunca UPDATE.
   */
  async insertFinancialSnapshot(input: {
    snapshotDate: Date;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    totalSystemBalance: Prisma.Decimal;
    totalFeeRevenue: Prisma.Decimal;
    totalVolume: Prisma.Decimal;
  }): Promise<FinancialSnapshot> {
    return this.prisma.financialSnapshot.create({
      data: {
        snapshotDate: this.toSnapshotDateOnly(input.snapshotDate),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency.toUpperCase(),
        totalSystemBalance: input.totalSystemBalance,
        totalFeeRevenue: input.totalFeeRevenue,
        totalVolume: input.totalVolume,
      },
    });
  }

  /**
   * Solo ventana de corrección: delete + insert (nuevo id) para late-arriving data.
   */
  async replaceFinancialSnapshotInCorrectionWindow(input: {
    snapshotDate: Date;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    totalSystemBalance: Prisma.Decimal;
    totalFeeRevenue: Prisma.Decimal;
    totalVolume: Prisma.Decimal;
  }): Promise<FinancialSnapshot> {
    const snapshotDate = this.toSnapshotDateOnly(input.snapshotDate);
    const currency = input.currency.toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      await tx.financialSnapshot.delete({
        where: {
          snapshotDate_currency: { snapshotDate, currency },
        },
      });

      return tx.financialSnapshot.create({
        data: {
          snapshotDate,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          currency,
          totalSystemBalance: input.totalSystemBalance,
          totalFeeRevenue: input.totalFeeRevenue,
          totalVolume: input.totalVolume,
        },
      });
    });
  }

  async listDistinctLedgerCurrencies(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ currency: string }[]>`
      SELECT DISTINCT currency FROM ledger_entries ORDER BY currency ASC
    `;
    return rows.map((r) => r.currency);
  }

  async listSnapshots(from?: Date, to?: Date, currency?: string) {
    return this.prisma.financialSnapshot.findMany({
      where: {
        ...(currency ? { currency: currency.toUpperCase() } : {}),
        ...(from || to
          ? {
              snapshotDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { snapshotDate: 'desc' },
    });
  }

  /**
   * Keyset pagination — memoria O(chunkSize), no carga dataset completo.
   */
  async fetchWalletLedgerExportChunk(
    walletId: string,
    range: DateRangeFilter | undefined,
    cursor: { createdAt: Date; id: string } | null,
    chunkSize = EXPORT_CHUNK_SIZE,
  ): Promise<LedgerExportRow[]> {
    const cursorFilter = cursor
      ? Prisma.sql`AND (le."createdAt", le.id) > (${cursor.createdAt}, ${cursor.id})`
      : Prisma.empty;

    const rangeFilter = range
      ? Prisma.sql`AND le."createdAt" >= ${range.startDate} AND le."createdAt" < ${range.endDate}`
      : Prisma.empty;

    return this.prisma.$queryRaw<LedgerExportRow[]>`
      SELECT
        le."walletId",
        le."operationType"::text AS "operationType",
        le.amount,
        le.currency,
        le."balanceBefore",
        le."balanceAfter",
        le."createdAt",
        le."transactionGroupId",
        le."correlationId",
        le.id
      FROM ledger_entries le
      WHERE le."walletId" = ${walletId}
        ${rangeFilter}
        ${cursorFilter}
      ORDER BY le."createdAt" ASC, le.id ASC
      LIMIT ${chunkSize}
    `;
  }

  async fetchFeeRevenueExportChunk(
    range: DateRangeFilter,
    cursor: { createdAt: Date; transactionGroupId: string; walletId: string } | null,
    chunkSize = EXPORT_CHUNK_SIZE,
  ): Promise<
    {
      createdAt: Date;
      amount: Prisma.Decimal;
      currency: string;
      transactionGroupId: string;
      groupType: string;
      correlationId: string | null;
      walletId: string;
    }[]
  > {
    const cursorFilter = cursor
      ? Prisma.sql`AND (le."createdAt", le."transactionGroupId", le."walletId") > (${cursor.createdAt}, ${cursor.transactionGroupId}, ${cursor.walletId})`
      : Prisma.empty;

    return this.prisma.$queryRaw`
      SELECT
        le."createdAt",
        le.amount,
        le.currency,
        le."transactionGroupId",
        tg.type::text AS "groupType",
        le."correlationId",
        le."walletId"
      FROM ledger_entries le
      INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
        AND le."createdAt" >= ${range.startDate}
        AND le."createdAt" < ${range.endDate}
        ${this.currencyFilter(range.currency)}
        ${cursorFilter}
      ORDER BY le."createdAt" ASC, le."transactionGroupId" ASC, le."walletId" ASC
      LIMIT ${chunkSize}
    `;
  }

  async fetchReconciliationDriftChunk(
    offset: number,
    chunkSize = EXPORT_CHUNK_SIZE,
  ): Promise<
    {
      walletId: string;
      projectionBalance: Prisma.Decimal;
      ledgerBalance: Prisma.Decimal;
      difference: Prisma.Decimal;
    }[]
  > {
    const signedAmount = ledgerSignedAmountExpression();

    return this.prisma.$queryRaw`
      SELECT
        w.id AS "walletId",
        w."currentBalance" AS "projectionBalance",
        COALESCE(agg."ledgerBalance", 0)::decimal(18, 2) AS "ledgerBalance",
        (w."currentBalance" - COALESCE(agg."ledgerBalance", 0))::decimal(18, 2) AS difference
      FROM wallets w
      LEFT JOIN (
        SELECT
          "walletId",
          SUM(${signedAmount})::decimal(18, 2) AS "ledgerBalance"
        FROM ledger_entries
        GROUP BY "walletId"
      ) agg ON w.id = agg."walletId"
      WHERE w."currentBalance" <> COALESCE(agg."ledgerBalance", 0)
      ORDER BY w.id ASC
      OFFSET ${offset}
      LIMIT ${chunkSize}
    `;
  }

  async findWalletProjection(walletId: string) {
    return this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: {
        id: true,
        currentBalance: true,
        currency: true,
        kind: true,
      },
    });
  }
}
