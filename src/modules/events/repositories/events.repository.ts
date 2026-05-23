import { Injectable } from '@nestjs/common';
import {
  FinancialEventType,
  Prisma,
  type FinancialEvent,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type RecordFinancialEventInput = {
  type: FinancialEventType;
  walletId?: string;
  counterpartyWalletId?: string;
  transactionGroupId?: string;
  amount?: Prisma.Decimal;
  currency?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createInTransaction(
    tx: Prisma.TransactionClient,
    input: RecordFinancialEventInput,
  ): Promise<FinancialEvent> {
    return tx.financialEvent.create({
      data: {
        type: input.type,
        walletId: input.walletId,
        counterpartyWalletId: input.counterpartyWalletId,
        transactionGroupId: input.transactionGroupId,
        amount: input.amount,
        currency: input.currency,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async listByWallet(walletId: string, limit = 50) {
    return this.prisma.financialEvent.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async countSince(since: Date, type?: FinancialEventType) {
    return this.prisma.financialEvent.count({
      where: {
        createdAt: { gte: since },
        ...(type ? { type } : {}),
      },
    });
  }
}
