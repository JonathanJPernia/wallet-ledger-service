import { Injectable } from '@nestjs/common';
import { Prisma, TransactionGroupStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../reconciliation/repositories/ledger-signed-amount.sql';

const VIEW_WALLET_BALANCE = 'mv_daily_wallet_balance';
const VIEW_FEE_REVENUE = 'mv_daily_fee_revenue';
const VIEW_SYSTEM_VOLUME = 'mv_daily_system_volume';

@Injectable()
export class MaterializedViewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async refreshDailyWalletBalances(bucketDate: Date, dayStart: Date, dayEnd: Date) {
    const signedAmount = ledgerSignedAmountExpression();
    const dateOnly = this.toDateOnly(bucketDate);
    const watermark = await this.getWatermark(VIEW_WALLET_BALANCE, dateOnly);

    if (!watermark?.lastEntryCreatedAt) {
      await this.fullRefreshWalletBalances(
        dateOnly,
        dayEnd,
        signedAmount,
      );
      return;
    }

    const deltaRows = await this.prisma.$queryRaw<
      { walletId: string; currency: string; delta: Prisma.Decimal; entryCount: number; maxCreatedAt: Date; maxId: string }[]
    >`
      SELECT
        le."walletId",
        le.currency,
        COALESCE(SUM(${signedAmount}), 0)::decimal(18, 2) AS delta,
        COUNT(*)::int AS "entryCount",
        MAX(le."createdAt") AS "maxCreatedAt",
        MAX(le.id) AS "maxId"
      FROM ledger_entries le
      WHERE le."createdAt" >= ${watermark.lastEntryCreatedAt}
        AND le."createdAt" < ${dayEnd}
        AND (le."createdAt", le.id) > (${watermark.lastEntryCreatedAt}, ${watermark.lastEntryId ?? ''})
      GROUP BY le."walletId", le.currency
    `;

    for (const row of deltaRows) {
      await this.prisma.$executeRaw`
        INSERT INTO mv_daily_wallet_balance (
          bucket_date, "walletId", currency, "ledgerBalance", "entryCount", refreshed_at
        )
        VALUES (
          ${dateOnly}::date,
          ${row.walletId},
          ${row.currency},
          ${row.delta},
          ${row.entryCount},
          NOW()
        )
        ON CONFLICT (bucket_date, "walletId")
        DO UPDATE SET
          "ledgerBalance" = mv_daily_wallet_balance."ledgerBalance" + EXCLUDED."ledgerBalance",
          "entryCount" = mv_daily_wallet_balance."entryCount" + EXCLUDED."entryCount",
          refreshed_at = NOW()
      `;
    }

    const last = deltaRows[deltaRows.length - 1];
    if (last?.maxCreatedAt) {
      await this.setWatermark(VIEW_WALLET_BALANCE, dateOnly, last.maxCreatedAt, last.maxId);
    }
  }

  private async fullRefreshWalletBalances(
    dateOnly: Date,
    dayEnd: Date,
    signedAmount: Prisma.Sql,
  ) {
    await this.prisma.$executeRaw`
      INSERT INTO mv_daily_wallet_balance (
        bucket_date, "walletId", currency, "ledgerBalance", "entryCount", refreshed_at
      )
      SELECT
        ${dateOnly}::date,
        le."walletId",
        le.currency,
        COALESCE(SUM(${signedAmount}), 0)::decimal(18, 2),
        COUNT(*)::int,
        NOW()
      FROM ledger_entries le
      WHERE le."createdAt" < ${dayEnd}
      GROUP BY le."walletId", le.currency
      ON CONFLICT (bucket_date, "walletId")
      DO UPDATE SET
        "ledgerBalance" = EXCLUDED."ledgerBalance",
        "entryCount" = EXCLUDED."entryCount",
        refreshed_at = NOW()
    `;

    const maxRow = await this.prisma.$queryRaw<
      { maxCreatedAt: Date | null; maxId: string | null }[]
    >`
      SELECT MAX("createdAt") AS "maxCreatedAt", MAX(id) AS "maxId"
      FROM ledger_entries
      WHERE "createdAt" < ${dayEnd}
    `;
    if (maxRow[0]?.maxCreatedAt) {
      await this.setWatermark(
        VIEW_WALLET_BALANCE,
        dateOnly,
        maxRow[0].maxCreatedAt,
        maxRow[0].maxId ?? '',
      );
    }
  }

  async refreshDailyFeeRevenue(bucketDate: Date, dayStart: Date, dayEnd: Date) {
    const dateOnly = this.toDateOnly(bucketDate);
    const watermark = await this.getWatermark(VIEW_FEE_REVENUE, dateOnly);
    const since = watermark?.lastEntryCreatedAt ?? dayStart;

    await this.prisma.$executeRaw`
      INSERT INTO mv_daily_fee_revenue (bucket_date, currency, "totalFees", "entryCount", refreshed_at)
      SELECT
        ${dateOnly}::date,
        le.currency,
        COALESCE(SUM(le.amount), 0)::decimal(18, 2),
        COUNT(*)::int,
        NOW()
      FROM ledger_entries le
      INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND tg.status = ${TransactionGroupStatus.COMPLETED}::"TransactionGroupStatus"
        AND le."createdAt" >= ${since}
        AND le."createdAt" < ${dayEnd}
        ${watermark?.lastEntryId ? Prisma.sql`AND (le."createdAt", le.id) > (${watermark.lastEntryCreatedAt}, ${watermark.lastEntryId})` : Prisma.empty}
      GROUP BY le.currency
      ON CONFLICT (bucket_date, currency)
      DO UPDATE SET
        "totalFees" = mv_daily_fee_revenue."totalFees" + EXCLUDED."totalFees",
        "entryCount" = mv_daily_fee_revenue."entryCount" + EXCLUDED."entryCount",
        refreshed_at = NOW()
    `;

    const maxRow = await this.prisma.$queryRaw<
      { maxCreatedAt: Date | null; maxId: string | null }[]
    >`
      SELECT MAX(le."createdAt") AS "maxCreatedAt", MAX(le.id) AS "maxId"
      FROM ledger_entries le
      INNER JOIN transaction_groups tg ON le."transactionGroupId" = tg.id
      WHERE le."operationType" = 'FEE_IN'::"OperationType"
        AND le."createdAt" >= ${dayStart}
        AND le."createdAt" < ${dayEnd}
    `;
    if (maxRow[0]?.maxCreatedAt) {
      await this.setWatermark(
        VIEW_FEE_REVENUE,
        dateOnly,
        maxRow[0].maxCreatedAt,
        maxRow[0].maxId ?? '',
      );
    }
  }

  async refreshDailySystemVolume(bucketDate: Date, dayStart: Date, dayEnd: Date) {
    const dateOnly = this.toDateOnly(bucketDate);
    const watermark = await this.getWatermark(VIEW_SYSTEM_VOLUME, dateOnly);
    const since = watermark?.lastEntryCreatedAt ?? dayStart;

    await this.prisma.$executeRaw`
      INSERT INTO mv_daily_system_volume (bucket_date, currency, "totalVolume", refreshed_at)
      SELECT
        ${dateOnly}::date,
        le.currency,
        COALESCE(SUM(le.amount), 0)::decimal(18, 2),
        NOW()
      FROM ledger_entries le
      WHERE le."operationType" IN (
        'DEPOSIT'::"OperationType",
        'WITHDRAW'::"OperationType",
        'TRANSFER_OUT'::"OperationType"
      )
        AND le."createdAt" >= ${since}
        AND le."createdAt" < ${dayEnd}
        ${watermark?.lastEntryId ? Prisma.sql`AND (le."createdAt", le.id) > (${watermark.lastEntryCreatedAt}, ${watermark.lastEntryId})` : Prisma.empty}
      GROUP BY le.currency
      ON CONFLICT (bucket_date, currency)
      DO UPDATE SET
        "totalVolume" = mv_daily_system_volume."totalVolume" + EXCLUDED."totalVolume",
        refreshed_at = NOW()
    `;

    const maxRow = await this.prisma.$queryRaw<
      { maxCreatedAt: Date | null; maxId: string | null }[]
    >`
      SELECT MAX("createdAt") AS "maxCreatedAt", MAX(id) AS "maxId"
      FROM ledger_entries
      WHERE "createdAt" >= ${dayStart}
        AND "createdAt" < ${dayEnd}
    `;
    if (maxRow[0]?.maxCreatedAt) {
      await this.setWatermark(
        VIEW_SYSTEM_VOLUME,
        dateOnly,
        maxRow[0].maxCreatedAt,
        maxRow[0].maxId ?? '',
      );
    }
  }

  private async getWatermark(viewKey: string, bucketDate: Date) {
    return this.prisma.mvRefreshWatermark.findUnique({
      where: {
        viewKey_bucketDate: { viewKey, bucketDate },
      },
    });
  }

  private async setWatermark(
    viewKey: string,
    bucketDate: Date,
    lastEntryCreatedAt: Date,
    lastEntryId: string,
  ) {
    await this.prisma.mvRefreshWatermark.upsert({
      where: { viewKey_bucketDate: { viewKey, bucketDate } },
      create: { viewKey, bucketDate, lastEntryCreatedAt, lastEntryId },
      update: { lastEntryCreatedAt, lastEntryId, refreshedAt: new Date() },
    });
  }

  private toDateOnly(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }
}
