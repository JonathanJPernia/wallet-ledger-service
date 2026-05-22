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
import { safeCommittedIdempotencyWhere } from '../../../common/database/idempotency-replay';
import {
  recordIdempotencyFailureOutsideTx,
  type RecordIdempotencyFailureInput,
} from '../../../common/database/idempotency-failure';
import {
  retrySerializable,
  SERIALIZABLE_TRANSACTION_OPTIONS,
} from '../../../common/database/serializable-transaction';
import { LockResolverService } from '../../../common/database/lock-resolver.service';
import {
  lockWalletsForUpdateInOrder,
  type LockedWalletRow,
} from '../../../common/database/wallet-lock';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type CreateWithdrawLedgerInput = {
  walletId: string;
  currency: string;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  transactionGroupId: string;
  correlationId?: string;
  referenceId?: string;
};

export type CreateWithdrawGroupInput = {
  businessReference?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
};

export type WithdrawRepositoryLogContext = {
  correlationId?: string;
  idempotencyKey?: string;
  walletId?: string;
};

@Injectable()
export class WithdrawRepository {
  private readonly logger = new Logger(WithdrawRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockResolver: LockResolverService,
  ) {}

  async findSafeCommittedReplay(
    scope: string,
    key: string,
    logContext?: WithdrawRepositoryLogContext,
  ): Promise<IdempotencyKey | null> {
    const record = await this.prisma.idempotencyKey.findFirst({
      where: safeCommittedIdempotencyWhere(
        scope,
        key,
        TransactionGroupType.WITHDRAW,
      ),
      include: {
        transactionGroup: { select: { id: true, status: true, type: true } },
      },
    });

    if (!record?.responseBody) {
      return null;
    }

    this.logger.log({
      event: 'withdraw.idempotency_safe_replay',
      correlationId: logContext?.correlationId,
      idempotencyKey: key,
      transactionGroupId: record.transactionGroupId,
      walletId: logContext?.walletId,
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

  async lockWithdrawParties(
    tx: Prisma.TransactionClient,
    walletId: string,
    systemFeeWalletId: string,
    logContext?: WithdrawRepositoryLogContext,
  ): Promise<{ wallet: LockedWalletRow; feeWallet: LockedWalletRow }> {
    const lockSet = this.lockResolver.resolveWithdrawLockSet(
      walletId,
      systemFeeWalletId,
    );
    const locked = await lockWalletsForUpdateInOrder(tx, lockSet);

    const wallet = locked.find((w) => w.id === walletId);
    const feeWallet = locked.find((w) => w.id === systemFeeWalletId);

    if (!wallet || !feeWallet) {
      throw new Error(
        'lockWithdrawParties: expected user and fee wallets after ordered lock',
      );
    }

    this.logger.log({
      event: 'withdraw.repository.wallets_locked',
      correlationId: logContext?.correlationId,
      walletId: wallet.id,
      feeWalletId: feeWallet.id,
      version: wallet.version,
      feeWalletVersion: feeWallet.version,
      idempotencyKey: logContext?.idempotencyKey,
    });

    return { wallet, feeWallet };
  }

  async createTransactionGroupPending(
    tx: Prisma.TransactionClient,
    input: CreateWithdrawGroupInput,
  ): Promise<TransactionGroup> {
    return tx.transactionGroup.create({
      data: {
        type: TransactionGroupType.WITHDRAW,
        status: TransactionGroupStatus.PENDING,
        businessReference: input.businessReference,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async createLedgerEntry(
    tx: Prisma.TransactionClient,
    input: CreateWithdrawLedgerInput,
    logContext?: WithdrawRepositoryLogContext,
  ): Promise<LedgerEntry> {
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: input.walletId,
        operationType: OperationType.WITHDRAW,
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
      event: 'withdraw.repository.ledger_appended',
      correlationId: logContext?.correlationId ?? input.correlationId,
      ledgerEntryId: entry.id,
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
    logContext?: WithdrawRepositoryLogContext,
  ): Promise<void> {
    await tx.transactionGroup.update({
      where: { id: groupId },
      data: {
        status: TransactionGroupStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      event: 'withdraw.repository.group_completed',
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
    logContext?: WithdrawRepositoryLogContext,
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
      event: 'withdraw.repository.idempotency_completed',
      correlationId: logContext?.correlationId,
      idempotencyKey: logContext?.idempotencyKey,
      transactionGroupId: data.transactionGroupId,
    });
  }

  recordIdempotencyFailureOutsideTx(input: RecordIdempotencyFailureInput) {
    return recordIdempotencyFailureOutsideTx(this.prisma, input);
  }
}
