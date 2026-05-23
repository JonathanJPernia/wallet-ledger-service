import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../modules/reconciliation/repositories/ledger-signed-amount.sql';

export type WalletLedgerBalanceRow = {
  walletId: string;
  ledgerBalance: Prisma.Decimal;
  currency: string;
};

@Injectable()
export class LedgerReplayRepository {
  constructor(private readonly prisma: PrismaService) {}

  async computeWalletBalanceAsOf(
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

  async computeAllWalletBalancesAsOf(
    asOf: Date,
    currency?: string,
  ): Promise<WalletLedgerBalanceRow[]> {
    const signedAmount = ledgerSignedAmountExpression();
    const currencyFilter = currency
      ? Prisma.sql`AND w.currency = ${currency.toUpperCase()}`
      : Prisma.empty;

    return this.prisma.$queryRaw<WalletLedgerBalanceRow[]>`
      SELECT
        w.id AS "walletId",
        w.currency,
        COALESCE(agg."ledgerBalance", 0)::decimal(18, 2) AS "ledgerBalance"
      FROM wallets w
      LEFT JOIN (
        SELECT
          le."walletId",
          SUM(${signedAmount})::decimal(18, 2) AS "ledgerBalance"
        FROM ledger_entries le
        WHERE le."createdAt" < ${asOf}
        GROUP BY le."walletId"
      ) agg ON w.id = agg."walletId"
      WHERE 1 = 1
        ${currencyFilter}
      ORDER BY w.id ASC
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
        status: true,
      },
    });
  }
}
