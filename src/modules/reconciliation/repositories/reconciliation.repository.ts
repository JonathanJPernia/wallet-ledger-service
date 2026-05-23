import { Injectable } from '@nestjs/common';
import { Prisma, type Wallet } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EXPORT_CHUNK_SIZE } from '../../reporting/constants';
import { classifyDriftSeverity } from '../utils/drift-severity.util';
import { ledgerSignedAmountExpression } from './ledger-signed-amount.sql';

export type LedgerBalanceRow = {
  walletId: string;
  ledgerBalance: Prisma.Decimal;
};

export type WalletDriftRow = {
  walletId: string;
  projectionBalance: Prisma.Decimal;
  ledgerBalance: Prisma.Decimal;
  difference: Prisma.Decimal;
};

export type WalletDriftRowV2 = WalletDriftRow & {
  severity: string;
  dataSource: 'ledger' | 'mv';
};

export type LedgerBalanceSource = {
  balance: Prisma.Decimal;
  dataSource: 'ledger' | 'mv';
};

@Injectable()
export class ReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findWalletById(walletId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { id: walletId } });
  }

  /**
   * Ledger = fuente de verdad. MV solo como fast-path si está fresco y coincide con política.
   */
  async resolveLedgerBalance(
    walletId: string,
    options?: { allowMvFastPath?: boolean },
  ): Promise<LedgerBalanceSource> {
    if (options?.allowMvFastPath) {
      const mv = await this.tryMvWalletBalance(walletId);
      if (mv) {
        return mv;
      }
    }
    const balance = await this.computeLedgerBalanceFromEntries(walletId);
    return { balance, dataSource: 'ledger' };
  }

  async computeLedgerBalance(walletId: string): Promise<Prisma.Decimal> {
    const { balance } = await this.resolveLedgerBalance(walletId);
    return balance;
  }

  private async tryMvWalletBalance(
    walletId: string,
  ): Promise<LedgerBalanceSource | null> {
    const yesterday = this.previousUtcDateOnly(new Date());
    const rows = await this.prisma.$queryRaw<
      { ledgerBalance: Prisma.Decimal; refreshedAt: Date }[]
    >`
      SELECT "ledgerBalance", refreshed_at AS "refreshedAt"
      FROM mv_daily_wallet_balance
      WHERE "walletId" = ${walletId}
        AND bucket_date = ${yesterday}::date
        AND refreshed_at >= NOW() - INTERVAL '20 minutes'
      LIMIT 1
    `;
    if (!rows[0]) {
      return null;
    }
    return {
      balance: new Prisma.Decimal(rows[0].ledgerBalance),
      dataSource: 'mv',
    };
  }

  private async computeLedgerBalanceFromEntries(
    walletId: string,
  ): Promise<Prisma.Decimal> {
    const signedAmount = ledgerSignedAmountExpression();

    const rows = await this.prisma.$queryRaw<
      { ledgerBalance: Prisma.Decimal }[]
    >`
      SELECT COALESCE(
        SUM(${signedAmount}),
        0
      )::decimal(18, 2) AS "ledgerBalance"
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
    `;

    return new Prisma.Decimal(rows[0]?.ledgerBalance ?? 0);
  }

  async computeLedgerBalancesGrouped(): Promise<LedgerBalanceRow[]> {
    const signedAmount = ledgerSignedAmountExpression();

    return this.prisma.$queryRaw<LedgerBalanceRow[]>`
      SELECT
        "walletId",
        COALESCE(
          SUM(${signedAmount}),
          0
        )::decimal(18, 2) AS "ledgerBalance"
      FROM ledger_entries
      GROUP BY "walletId"
    `;
  }

  async findAllWallets(): Promise<Wallet[]> {
    return this.prisma.wallet.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findWalletDriftRows(): Promise<WalletDriftRow[]> {
    const signedAmount = ledgerSignedAmountExpression();

    return this.prisma.$queryRaw<WalletDriftRow[]>`
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
    `;
  }

  async fetchReconciliationDriftChunkV2(
    offset: number,
    chunkSize = EXPORT_CHUNK_SIZE,
  ): Promise<
    {
      walletId: string;
      projectionBalance: string;
      ledgerBalance: string;
      difference: string;
      severity: string;
      dataSource: 'ledger' | 'mv';
    }[]
  > {
    const rows = await this.findWalletDriftRows();
    const page = rows.slice(offset, offset + chunkSize);
    return page.map((r) => ({
      walletId: r.walletId,
      projectionBalance: r.projectionBalance.toFixed(2),
      ledgerBalance: r.ledgerBalance.toFixed(2),
      difference: r.difference.toFixed(2),
      severity: classifyDriftSeverity(r.difference),
      dataSource: 'ledger' as const,
    }));
  }

  async repairProjectionToLedger(
    walletId: string,
    ledgerBalance: Prisma.Decimal,
  ): Promise<void> {
    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { currentBalance: ledgerBalance },
    });
  }

  private previousUtcDateOnly(date: Date): Date {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
}
