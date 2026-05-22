import { Injectable } from '@nestjs/common';
import {
  OperationType,
  Prisma,
  WalletKind,
  WalletStatus,
  type LedgerEntry,
  type Wallet,
} from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type CreateFeeLedgerInput = {
  walletId: string;
  currency: string;
  operationType: Extract<OperationType, 'FEE_IN' | 'FEE_OUT'>;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  transactionGroupId: string;
  correlationId?: string;
  referenceId?: string;
};

@Injectable()
export class FeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSystemFeeWalletByCurrency(currency: string): Promise<Wallet | null> {
    return this.prisma.wallet.findFirst({
      where: {
        kind: WalletKind.SYSTEM_FEE,
        currency: currency.toUpperCase(),
      },
    });
  }

  createSystemFeeWallet(currency: string): Promise<Wallet> {
    return this.prisma.wallet.create({
      data: {
        kind: WalletKind.SYSTEM_FEE,
        currency,
        status: WalletStatus.ACTIVE,
        currentBalance: new Prisma.Decimal(0),
        version: 1,
      },
    });
  }

  async createLedgerEntry(
    tx: Prisma.TransactionClient,
    input: CreateFeeLedgerInput,
  ): Promise<LedgerEntry> {
    return tx.ledgerEntry.create({
      data: {
        walletId: input.walletId,
        operationType: input.operationType,
        currency: input.currency,
        amount: input.amount,
        balanceBefore: input.balanceBefore,
        balanceAfter: input.balanceAfter,
        transactionGroupId: input.transactionGroupId,
        correlationId: input.correlationId,
        referenceId: input.referenceId,
      },
    });
  }
}
