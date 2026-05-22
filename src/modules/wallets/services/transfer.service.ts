import { Injectable, Logger } from '@nestjs/common';
import { OperationType, Prisma, WalletStatus } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import {
  ConcurrencyConflictException,
  CurrencyMismatchException,
  InsufficientFundsException,
  InvalidAmountException,
  SameWalletTransferException,
  WalletNotActiveException,
} from '../../../common/errors/financial.exceptions';
import type { TransferBodyDto } from '../dto/transfer-body.dto';
import { TransferResponseDto } from '../dto/transfer-response.dto';
import {
  failureErrorCodeFromError,
  failureReasonFromError,
  shouldPersistIdempotencyFailure,
} from '../../../common/database/idempotency-failure';
import {
  TransferRepository,
  type TransferRepositoryLogContext,
} from '../repositories/transfer.repository';

export const TRANSFER_IDEMPOTENCY_SCOPE = 'wallet.transfer';
export const IDEMPOTENCY_TTL_HOURS = 24;

export type TransferCommand = {
  fromWalletId: string;
  toWalletId: string;
  amount: Prisma.Decimal;
  idempotencyKey: string;
  requestMethod: string;
  requestPath: string;
  requestHash: string;
  referenceId?: string;
  correlationId?: string;
};

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(private readonly transferRepository: TransferRepository) {}

  async transfer(
    command: TransferCommand,
  ): Promise<ApiResponseDto<TransferResponseDto>> {
    const scope = TRANSFER_IDEMPOTENCY_SCOPE;
    const logCtx: TransferRepositoryLogContext = {
      correlationId: command.correlationId,
      idempotencyKey: command.idempotencyKey,
      fromWalletId: command.fromWalletId,
      toWalletId: command.toWalletId,
    };

    this.logger.log({
      event: 'transfer.started',
      fromWalletId: command.fromWalletId,
      toWalletId: command.toWalletId,
      amount: command.amount.toString(),
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });

    const safeReplay = await this.transferRepository.findSafeCommittedReplay(
      scope,
      command.idempotencyKey,
      logCtx,
    );
    if (safeReplay?.responseBody) {
      this.logger.log({
        event: 'transfer.idempotency_replay',
        source: 'safe_committed_fast_path',
        idempotencyKey: command.idempotencyKey,
        transferId: safeReplay.transactionGroupId,
        correlationId: command.correlationId,
      });
      const data = safeReplay.responseBody as unknown as TransferResponseDto;
      return buildApiResponse({
        ...data,
        idempotencyKey: command.idempotencyKey,
      });
    }

    try {
      const result = await this.transferRepository.runSerializable((tx) =>
        this.executeSerializableTransfer(tx, command, scope, logCtx),
      );

      return buildApiResponse(result);
    } catch (error) {
      if (shouldPersistIdempotencyFailure(error)) {
        await this.transferRepository.recordIdempotencyFailureOutsideTx({
          scope,
          key: command.idempotencyKey,
          requestHash: command.requestHash,
          requestMethod: command.requestMethod,
          requestPath: command.requestPath,
          reason: failureReasonFromError(error),
          errorCode: failureErrorCodeFromError(error),
        });
      }
      throw error;
    }
  }

  transferFromHttp(
    body: TransferBodyDto,
    idempotencyKey: string,
    requestMeta: {
      method: string;
      path: string;
      requestHash: string;
      correlationId?: string;
    },
  ): Promise<ApiResponseDto<TransferResponseDto>> {
    return this.transfer({
      fromWalletId: body.fromWalletId,
      toWalletId: body.toWalletId,
      amount: new Prisma.Decimal(body.amount),
      idempotencyKey,
      requestMethod: requestMeta.method,
      requestPath: requestMeta.path,
      requestHash: requestMeta.requestHash,
      referenceId: body.referenceId,
      correlationId: requestMeta.correlationId,
    });
  }

  private async executeSerializableTransfer(
    tx: Prisma.TransactionClient,
    command: TransferCommand,
    scope: string,
    logCtx: TransferRepositoryLogContext,
  ): Promise<TransferResponseDto> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

    const claim = await this.transferRepository.claimIdempotency(tx, {
      scope,
      key: command.idempotencyKey,
      requestHash: command.requestHash,
      requestMethod: command.requestMethod,
      requestPath: command.requestPath,
      expiresAt,
    });

    if (claim.kind === 'cached') {
      this.logger.log({
        event: 'transfer.idempotency_replay',
        source: 'serializable_tx',
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
      });
      return {
        ...(claim.record.responseBody as unknown as TransferResponseDto),
        idempotencyKey: command.idempotencyKey,
      };
    }

    const result = await this.executeTransferCore(tx, command, logCtx);

    const response: TransferResponseDto = {
      ...result,
      idempotencyKey: command.idempotencyKey,
    };

    await this.transferRepository.completeIdempotency(
      tx,
      claim.record.id,
      {
        responseStatus: 201,
        responseBody: response as unknown as Prisma.InputJsonValue,
        transactionGroupId: result.transferId,
      },
      logCtx,
    );

    this.logger.log({
      event: 'transfer.completed',
      correlationId: command.correlationId,
      transferId: result.transferId,
      fromWalletId: result.fromWalletId,
      toWalletId: result.toWalletId,
      amount: command.amount.toString(),
      fromBalanceAfter: result.fromBalanceAfter,
      toBalanceAfter: result.toBalanceAfter,
      idempotencyKey: command.idempotencyKey,
    });

    return response;
  }

  /**
   * 1. lock wallets (UUID asc)
   * 2. validate ACTIVE, currency, funds
   * 3. transaction_group PENDING
   * 4. ledger TRANSFER_OUT + TRANSFER_IN (amount > 0)
   * 5. projections both wallets
   * 6. group COMPLETED
   * (idempotency COMPLETED — fuera, último)
   */
  private async executeTransferCore(
    tx: Prisma.TransactionClient,
    command: TransferCommand,
    logCtx: TransferRepositoryLogContext,
  ): Promise<Omit<TransferResponseDto, 'idempotencyKey'>> {
    if (command.fromWalletId === command.toWalletId) {
      throw new SameWalletTransferException(command.fromWalletId);
    }

    if (command.amount.lte(0) || !command.amount.isFinite()) {
      throw new InvalidAmountException();
    }

    const { from, to } = await this.transferRepository.lockWallets(
      tx,
      [command.fromWalletId, command.toWalletId],
      logCtx,
    );

    this.logger.log({
      event: 'transfer.wallets_locked',
      fromWalletId: from.id,
      toWalletId: to.id,
      correlationId: command.correlationId,
    });

    if (from.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(from.id, from.status);
    }
    if (to.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(to.id, to.status);
    }

    if (from.currency !== to.currency) {
      throw new CurrencyMismatchException(from.currency, to.currency);
    }

    const fromBefore = from.currentBalance;
    if (fromBefore.lt(command.amount)) {
      throw new InsufficientFundsException(from.id);
    }

    const fromAfter = fromBefore.sub(command.amount);
    const toBefore = to.currentBalance;
    const toAfter = toBefore.add(command.amount);

    const groupMetadata: Prisma.InputJsonValue = {
      fromWalletId: from.id,
      toWalletId: to.id,
      correlationId: command.correlationId,
      referenceId: command.referenceId,
    };

    const group = await this.transferRepository.createTransactionGroupPending(
      tx,
      {
        correlationId: command.correlationId,
        businessReference: command.referenceId,
        metadata: groupMetadata,
      },
    );

    const debitEntry = await this.transferRepository.createLedgerEntry(
      tx,
      {
        walletId: from.id,
        currency: from.currency,
        operationType: OperationType.TRANSFER_OUT,
        amount: command.amount,
        balanceBefore: fromBefore,
        balanceAfter: fromAfter,
        transactionGroupId: group.id,
        correlationId: command.correlationId,
        referenceId: command.referenceId,
      },
      logCtx,
    );

    const creditEntry = await this.transferRepository.createLedgerEntry(
      tx,
      {
        walletId: to.id,
        currency: to.currency,
        operationType: OperationType.TRANSFER_IN,
        amount: command.amount,
        balanceBefore: toBefore,
        balanceAfter: toAfter,
        transactionGroupId: group.id,
        correlationId: command.correlationId,
        referenceId: command.referenceId,
      },
      logCtx,
    );

    this.logger.log({
      event: 'transfer.ledger_created',
      correlationId: command.correlationId,
      transferId: group.id,
      debitLedgerEntryId: debitEntry.id,
      creditLedgerEntryId: creditEntry.id,
    });

    const fromUpdated = await this.transferRepository.updateWalletProjection(
      tx,
      from.id,
      from.version,
      fromAfter,
    );
    if (fromUpdated !== 1) {
      throw new ConcurrencyConflictException(from.id);
    }

    const toUpdated = await this.transferRepository.updateWalletProjection(
      tx,
      to.id,
      to.version,
      toAfter,
    );
    if (toUpdated !== 1) {
      throw new ConcurrencyConflictException(to.id);
    }

    await this.transferRepository.completeTransactionGroup(
      tx,
      group.id,
      logCtx,
    );

    return {
      transferId: group.id,
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: command.amount.toFixed(2),
      fromBalanceBefore: fromBefore.toFixed(2),
      fromBalanceAfter: fromAfter.toFixed(2),
      toBalanceBefore: toBefore.toFixed(2),
      toBalanceAfter: toAfter.toFixed(2),
      status: 'COMPLETED',
    };
  }
}
