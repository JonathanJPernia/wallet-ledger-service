import { Injectable } from '@nestjs/common';
import { Prisma, type Wallet } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
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

@Injectable()
export class ReconciliationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findWalletById(walletId: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { id: walletId } });
  }

  /**
   * Suma firmada de asientos por wallet (ledger = fuente de verdad).
   * Sin filas → 0.
   */
  async computeLedgerBalance(walletId: string): Promise<Prisma.Decimal> {
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

    const value = rows[0]?.ledgerBalance ?? 0;
    return new Prisma.Decimal(value);
  }

  /**
   * Balances agregados desde ledger para todas las wallets con movimientos.
   */
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

  /**
   * Wallets cuya proyección no coincide con la suma del ledger (incluye sin asientos → ledger 0).
   */
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
}
