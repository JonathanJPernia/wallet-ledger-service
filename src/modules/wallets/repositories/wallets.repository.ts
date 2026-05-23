import { Injectable } from '@nestjs/common';
import { LedgerEntry, Prisma, Wallet, WalletStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ledgerSignedAmountExpression } from '../../reconciliation/repositories/ledger-signed-amount.sql';
import type { MovementCursor } from '../utils/movement-cursor.util';

export type CreateWalletRecordInput = {
  currency: string;
};

export type ListLedgerEntriesInput = {
  walletId: string;
  limit: number;
  cursor?: MovementCursor;
  startDate?: Date;
  endDate?: Date;
};

@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWalletRecordInput): Promise<Wallet> {
    return this.prisma.wallet.create({
      data: {
        currency: input.currency,
        status: WalletStatus.ACTIVE,
        currentBalance: new Prisma.Decimal(0),
        version: 1,
      },
    });
  }

  async findById(id: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { id },
    });
  }

  async sumLedgerBalance(walletId: string): Promise<Prisma.Decimal> {
    const signed = ledgerSignedAmountExpression();
    const rows = await this.prisma.$queryRaw<{ balance: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(${signed}), 0)::decimal(18, 2) AS balance
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
    `;
    return new Prisma.Decimal(rows[0]?.balance ?? 0);
  }

  async listLedgerEntries(
    input: ListLedgerEntriesInput,
  ): Promise<LedgerEntry[]> {
    const cursorFilter = input.cursor
      ? Prisma.sql`AND (le."createdAt", le.id) < (${input.cursor.createdAt}, ${input.cursor.id})`
      : Prisma.empty;

    const startFilter = input.startDate
      ? Prisma.sql`AND le."createdAt" >= ${input.startDate}`
      : Prisma.empty;

    const endFilter = input.endDate
      ? Prisma.sql`AND le."createdAt" < ${input.endDate}`
      : Prisma.empty;

    return this.prisma.$queryRaw<LedgerEntry[]>`
      SELECT
        le.id,
        le."walletId",
        le."operationType",
        le.currency,
        le.amount,
        le."balanceBefore",
        le."balanceAfter",
        le."transactionGroupId",
        le."referenceId",
        le."correlationId",
        le."createdAt"
      FROM ledger_entries le
      WHERE le."walletId" = ${input.walletId}
        ${startFilter}
        ${endFilter}
        ${cursorFilter}
      ORDER BY le."createdAt" DESC, le.id DESC
      LIMIT ${input.limit}
    `;
  }
}
