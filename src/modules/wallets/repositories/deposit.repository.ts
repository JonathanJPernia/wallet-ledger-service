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

export type CreateDepositLedgerInput = {
  walletId: string;
  currency: string;
  amount: Prisma.Decimal;
  balanceBefore: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  transactionGroupId: string;
  correlationId?: string;
  referenceId?: string;
};

export type CreateDepositGroupInput = {
  businessReference?: string;
  initiatedBy?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
};

export type RepositoryLogContext = {
  correlationId?: string;
  idempotencyKey?: string;
  walletId?: string;
};

@Injectable()
export class DepositRepository {
  private readonly logger = new Logger(DepositRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fast path seguro: solo replay si idempotency COMPLETED + response persistida
   * y TransactionGroup ya está COMPLETED (commit financiero atómico previo).
   */
  async findSafeCommittedReplay(
    scope: string,
    key: string,
    logContext?: RepositoryLogContext,
  ): Promise<IdempotencyKey | null> {
    const record = await this.prisma.idempotencyKey.findFirst({
      where: safeCommittedIdempotencyWhere(
        scope,
        key,
        TransactionGroupType.DEPOSIT,
      ),
      include: {
        transactionGroup: { select: { id: true, status: true, type: true } },
      },
    });

    if (!record?.responseBody) {
      return null;
    }

    this.logger.log({
      event: 'deposit.idempotency_safe_replay',
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

  async lockWallet(
    tx: Prisma.TransactionClient,
    walletId: string,
    logContext?: RepositoryLogContext,
  ): Promise<LockedWalletRow> {
    const [wallet] = await lockWalletsForUpdateInOrder(tx, [walletId]);

    this.logger.log({
      event: 'deposit.repository.wallet_locked',
      correlationId: logContext?.correlationId,
      walletId: wallet.id,
      version: wallet.version,
      idempotencyKey: logContext?.idempotencyKey,
    });

    return wallet;
  }

  async createTransactionGroupPending(
    tx: Prisma.TransactionClient,
    input: CreateDepositGroupInput,
  ): Promise<TransactionGroup> {
    return tx.transactionGroup.create({
      data: {
        type: TransactionGroupType.DEPOSIT,
        status: TransactionGroupStatus.PENDING,
        businessReference: input.businessReference,
        initiatedBy: input.initiatedBy,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async createLedgerEntry(
    tx: Prisma.TransactionClient,
    input: CreateDepositLedgerInput,
    logContext?: RepositoryLogContext,
  ): Promise<LedgerEntry> {
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: input.walletId,
        operationType: OperationType.DEPOSIT,
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
      event: 'deposit.repository.ledger_appended',
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
    logContext?: RepositoryLogContext,
  ): Promise<void> {
    await tx.transactionGroup.update({
      where: { id: groupId },
      data: {
        status: TransactionGroupStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.log({
      event: 'deposit.repository.group_completed',
      correlationId: logContext?.correlationId,
      transactionGroupId: groupId,
      idempotencyKey: logContext?.idempotencyKey,
    });
  }

  /**
   * SIEMPRE el último paso de la TX financiera (después de group COMPLETED).
   */
  async completeIdempotency(
    tx: Prisma.TransactionClient,
    idempotencyId: string,
    data: {
      responseStatus: number;
      responseBody: Prisma.InputJsonValue;
      transactionGroupId: string;
    },
    logContext?: RepositoryLogContext,
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
      event: 'deposit.repository.idempotency_completed',
      correlationId: logContext?.correlationId,
      idempotencyKey: logContext?.idempotencyKey,
      transactionGroupId: data.transactionGroupId,
    });
  }

  /**
   * Marca FAILED en TX independiente (post-rollback). Ver idempotency-failure.ts.
   */
  recordIdempotencyFailureOutsideTx(input: RecordIdempotencyFailureInput) {
    return recordIdempotencyFailureOutsideTx(this.prisma, input);
  }
}
