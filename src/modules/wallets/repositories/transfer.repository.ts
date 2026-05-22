import { Injectable, Logger } from '@nestjs/common';
import {
  IdempotencyStatus,
  OperationType,
  Prisma,
  TransactionGroupStatus,
  TransactionGroupType,
  type IdempotencyKey,
  type LedgerEntry,
  type TransactionGroup,
} from '@prisma/client';
import {
  claimIdempotencyInTransaction,
  type IdempotencyClaimInput,
  type IdempotencyClaimResult,
} from '../../../common/database/idempotency-lock';
import {
  retrySerializable,
  SERIALIZABLE_TRANSACTION_OPTIONS,
} from '../../../common/database/serializable-transaction';
import {
  lockWalletsForUpdateInOrder,
  type LockedWalletRow,
} from '../../../common/database/wallet-lock';
import {
  recordIdempotencyFailureOutsideTx,
  type RecordIdempotencyFailureInput,
} from '../../../common/database/idempotency-failure';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type CreateTransferLedgerInput = {
  walletId: string;
  currency: string;
  operationType: OperationType;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  transactionGroupId: string;
  correlationId?: string;
  referenceId?: string;
};

export type CreateTransferGroupInput = {
  businessReference?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
};

export type TransferRepositoryLogContext = {
  correlationId?: string;
  idempotencyKey?: string;
  fromWalletId?: string;
  toWalletId?: string;
};

@Injectable()
export class TransferRepository {
  private readonly logger = new Logger(TransferRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findSafeCommittedReplay(
    scope: string,
    key: string,
    logContext?: TransferRepositoryLogContext,
  ): Promise<IdempotencyKey | null> {
    const record = await this.prisma.idempotencyKey.findFirst({
      where: {
        scope,
        key,
        status: IdempotencyStatus.COMPLETED,
        responseStatus: { not: null },
        responseBody: { not: Prisma.DbNull },
        transactionGroupId: { not: null },
        transactionGroup: {
          status: TransactionGroupStatus.COMPLETED,
          type: TransactionGroupType.TRANSFER,
        },
      },
      include: {
        transactionGroup: { select: { id: true, status: true, type: true } },
      },
    });

    if (!record?.responseBody) {
      return null;
    }

    this.logger.log({
      event: 'transfer.idempotency_safe_replay',
      correlationId: logContext?.correlationId,
      idempotencyKey: key,
      transactionGroupId: record.transactionGroupId,
      fromWalletId: logContext?.fromWalletId,
      toWalletId: logContext?.toWalletId,
    });

    return record;
  }

  async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return retrySerializable(() =>
      this.prisma.$transaction(fn, SERIALIZABLE_TRANSACTION_OPTIONS),
    );
  }

  async claimIdempotency(
    tx: Prisma.TransactionClient,
    input: IdempotencyClaimInput,
  ): Promise<IdempotencyClaimResult> {
    return claimIdempotencyInTransaction(tx, input, {
      auditPrisma: this.prisma,
    });
  }

  async lockWallets(
    tx: Prisma.TransactionClient,
    walletIds: [string, string],
    logContext?: TransferRepositoryLogContext,
  ): Promise<{ from: LockedWalletRow; to: LockedWalletRow }> {
    const [fromWalletId, toWalletId] = walletIds;
    const locked = await lockWalletsForUpdateInOrder(tx, [
      fromWalletId,
      toWalletId,
    ]);

    const from = locked.find((w) => w.id === fromWalletId);
    const to = locked.find((w) => w.id === toWalletId);

    if (!from || !to) {
      throw new Error('lockWallets: expected both wallets after ordered lock');
    }

    this.logger.log({
      event: 'transfer.repository.wallets_locked',
      correlationId: logContext?.correlationId,
      fromWalletId: from.id,
      toWalletId: to.id,
      fromVersion: from.version,
      toVersion: to.version,
      idempotencyKey: logContext?.idempotencyKey,
    });

    return { from, to };
  }

  async createTransactionGroupPending(
    tx: Prisma.TransactionClient,
    input: CreateTransferGroupInput,
  ): Promise<TransactionGroup> {
    return tx.transactionGroup.create({
      data: {
        type: TransactionGroupType.TRANSFER,
        status: TransactionGroupStatus.PENDING,
        businessReference: input.businessReference,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async createLedgerEntry(
    tx: Prisma.TransactionClient,
    input: CreateTransferLedgerInput,
    logContext?: TransferRepositoryLogContext,
  ): Promise<LedgerEntry> {
    const entry = await tx.ledgerEntry.create({
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

    this.logger.log({
      event: 'transfer.repository.ledger_appended',
      correlationId: logContext?.correlationId ?? input.correlationId,
      ledgerEntryId: entry.id,
      operationType: input.operationType,
      transactionGroupId: input.transactionGroupId,
      walletId: input.walletId,
      amount: input.amount.toString(),
      idempotencyKey: logContext?.idempotencyKey,
    });

    return entry;
  }

  async updateWalletProjection(
    tx: Prisma.TransactionClient,
    walletId: string,
    expectedVersion: number,
    balanceAfter: Prisma.Decimal,
  ): Promise<number> {
    const result = await tx.wallet.updateMany({
      where: { id: walletId, version: expectedVersion },
      data: {
        currentBalance: balanceAfter,
        version: { increment: 1 },
      },
    });
    return result.count;
  }

  async completeTransactionGroup(
    tx: Prisma.TransactionClient,
    groupId: string,
    logContext?: TransferRepositoryLogContext,
  ): Promise<void> {
    await tx.transactionGroup.update({
      where: { id: groupId },
      data: {
        status: TransactionGroupStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      event: 'transfer.repository.group_completed',
      correlationId: logContext?.correlationId,
      transactionGroupId: groupId,
      idempotencyKey: logContext?.idempotencyKey,
    });
  }

  async completeIdempotency(
    tx: Prisma.TransactionClient,
    idempotencyId: string,
    data: {
      responseStatus: number;
      responseBody: Prisma.InputJsonValue;
      transactionGroupId: string;
    },
    logContext?: TransferRepositoryLogContext,
  ): Promise<void> {
    await tx.idempotencyKey.update({
      where: { id: idempotencyId },
      data: {
        status: IdempotencyStatus.COMPLETED,
        responseStatus: data.responseStatus,
        responseBody: data.responseBody,
        transactionGroupId: data.transactionGroupId,
      },
    });

    this.logger.log({
      event: 'transfer.repository.idempotency_completed',
      correlationId: logContext?.correlationId,
      idempotencyKey: logContext?.idempotencyKey,
      transactionGroupId: data.transactionGroupId,
    });
  }

  recordIdempotencyFailureOutsideTx(input: RecordIdempotencyFailureInput) {
    return recordIdempotencyFailureOutsideTx(this.prisma, input);
  }
}
