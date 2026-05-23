import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

@Injectable()
export class AnomalyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getWalletVelocity(walletId: string, since: Date) {
    const rows = await this.prisma.$queryRaw<
      { operationType: string; count: bigint }[]
    >`
      SELECT "operationType"::text AS "operationType", COUNT(*)::bigint AS count
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
        AND "createdAt" >= ${since}
      GROUP BY "operationType"
    `;

    const map = new Map(rows.map((r) => [r.operationType, Number(r.count)]));
    return {
      deposits1h: map.get('DEPOSIT') ?? 0,
      withdraws1h: map.get('WITHDRAW') ?? 0,
      transfersOut1h: map.get('TRANSFER_OUT') ?? 0,
    };
  }

  async getWalletAmountStats(walletId: string, since: Date) {
    const rows = await this.prisma.$queryRaw<
      {
        avgAmount: Prisma.Decimal | null;
        maxAmount: Prisma.Decimal | null;
        lastAmount: Prisma.Decimal | null;
      }[]
    >`
      SELECT
        AVG(amount)::decimal(18, 2) AS "avgAmount",
        MAX(amount)::decimal(18, 2) AS "maxAmount",
        (
          SELECT amount FROM ledger_entries
          WHERE "walletId" = ${walletId}
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) AS "lastAmount"
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
        AND "createdAt" >= ${since}
    `;

    const row = rows[0];
    return {
      avgAmount: Number(row?.avgAmount ?? 0),
      maxAmount: Number(row?.maxAmount ?? 0),
      lastAmount: Number(row?.lastAmount ?? 0),
    };
  }

  async countCircularTransfers(walletId: string, since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ pairs: bigint }[]>`
      SELECT COUNT(*)::bigint AS pairs
      FROM ledger_entries out
      INNER JOIN ledger_entries inc
        ON out."transactionGroupId" = inc."transactionGroupId"
        AND out."operationType" = 'TRANSFER_OUT'
        AND inc."operationType" = 'TRANSFER_IN'
      WHERE out."walletId" = ${walletId}
        AND out."createdAt" >= ${since}
        AND inc."walletId" <> out."walletId"
        AND EXISTS (
          SELECT 1
          FROM ledger_entries back
          WHERE back."walletId" = inc."walletId"
            AND back."operationType" = 'TRANSFER_OUT'
            AND back."createdAt" >= ${since}
            AND EXISTS (
              SELECT 1 FROM ledger_entries ret
              WHERE ret."walletId" = out."walletId"
                AND ret."operationType" = 'TRANSFER_IN'
                AND ret."transactionGroupId" = back."transactionGroupId"
            )
        )
    `;
    return Number(rows[0]?.pairs ?? 0);
  }

  async countSelfTransferLoops(walletId: string, since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ loops: bigint }[]>`
      SELECT COUNT(*)::bigint AS loops
      FROM ledger_entries a
      INNER JOIN ledger_entries b
        ON a."transactionGroupId" = b."transactionGroupId"
      WHERE a."walletId" = ${walletId}
        AND b."walletId" = ${walletId}
        AND a."operationType" = 'TRANSFER_OUT'
        AND b."operationType" = 'TRANSFER_IN'
        AND a."createdAt" >= ${since}
    `;
    return Number(rows[0]?.loops ?? 0);
  }

  async getFeeWalletInflow1h(since: Date, currency = 'USD') {
    const rows = await this.prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(le.amount), 0)::decimal(18, 2) AS total
      FROM ledger_entries le
      INNER JOIN wallets w ON le."walletId" = w.id
      WHERE le."operationType" = 'FEE_IN'
        AND w.kind = 'SYSTEM_FEE'
        AND le."createdAt" >= ${since}
        AND le.currency = ${currency}
    `;
    return new Prisma.Decimal(rows[0]?.total ?? 0);
  }
}
