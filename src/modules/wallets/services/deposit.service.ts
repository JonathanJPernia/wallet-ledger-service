import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WalletStatus } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import {
  ConcurrencyConflictException,
  InvalidAmountException,
  WalletNotActiveException,
} from '../../../common/errors/financial.exceptions';
import { DepositResponseDto } from '../dto/deposit-response.dto';
import type { DepositBodyDto } from '../dto/deposit-body.dto';
import {
  failureErrorCodeFromError,
  failureReasonFromError,
  shouldPersistIdempotencyFailure,
} from '../../../common/database/idempotency-failure';
import {
  DepositRepository,
  type RepositoryLogContext,
} from '../repositories/deposit.repository';

export const DEFAULT_IDEMPOTENCY_SCOPE = 'default';
export const IDEMPOTENCY_TTL_HOURS = 24;

export type DepositCommand = {
  walletId: string;
  amount: Prisma.Decimal;
  idempotencyKey: string;
  requestMethod: string;
  requestPath: string;
  requestHash: string;
  referenceId?: string;
  correlationId?: string;
};

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(private readonly depositRepository: DepositRepository) {}

  async deposit(
    command: DepositCommand,
  ): Promise<ApiResponseDto<DepositResponseDto>> {
    const scope = DEFAULT_IDEMPOTENCY_SCOPE;
    const logCtx: RepositoryLogContext = {
      correlationId: command.correlationId,
      idempotencyKey: command.idempotencyKey,
      walletId: command.walletId,
    };

    this.logger.log({
      event: 'deposit.started',
      walletId: command.walletId,
      amount: command.amount.toString(),
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });

    const safeReplay = await this.depositRepository.findSafeCommittedReplay(
      scope,
      command.idempotencyKey,
      logCtx,
    );
    if (safeReplay?.responseBody) {
      this.logger.log({
        event: 'deposit.idempotency_replay',
        source: 'safe_committed_fast_path',
        idempotencyKey: command.idempotencyKey,
        transactionGroupId: safeReplay.transactionGroupId,
        correlationId: command.correlationId,
      });
      const data = safeReplay.responseBody as unknown as DepositResponseDto;
      return buildApiResponse({
        ...data,
        idempotencyKey: command.idempotencyKey,
      });
    }

    try {
      const result = await this.depositRepository.runSerializable((tx) =>
        this.executeSerializableDeposit(tx, command, scope, logCtx),
      );

      return buildApiResponse(result);
    } catch (error) {
      if (shouldPersistIdempotencyFailure(error)) {
        await this.depositRepository.recordIdempotencyFailureOutsideTx({
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

  depositFromHttp(
    walletId: string,
    body: DepositBodyDto,
    idempotencyKey: string,
    requestMeta: {
      method: string;
      path: string;
      requestHash: string;
      correlationId?: string;
    },
  ): Promise<ApiResponseDto<DepositResponseDto>> {
    const amount = new Prisma.Decimal(body.amount);

    return this.deposit({
      walletId,
      amount,
      idempotencyKey,
      requestMethod: requestMeta.method,
      requestPath: requestMeta.path,
      requestHash: requestMeta.requestHash,
      referenceId: body.referenceId,
      correlationId: requestMeta.correlationId,
    });
  }

  private async executeSerializableDeposit(
    tx: Prisma.TransactionClient,
    command: DepositCommand,
    scope: string,
    logCtx: RepositoryLogContext,
  ): Promise<DepositResponseDto> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

    const claim = await this.depositRepository.claimIdempotency(tx, {
      scope,
      key: command.idempotencyKey,
      requestHash: command.requestHash,
      requestMethod: command.requestMethod,
      requestPath: command.requestPath,
      expiresAt,
    });

    if (claim.kind === 'cached') {
      this.logger.log({
        event: 'deposit.idempotency_replay',
        idempotencyKey: command.idempotencyKey,
        source: 'serializable_tx',
        correlationId: command.correlationId,
      });
      return {
        ...(claim.record.responseBody as unknown as DepositResponseDto),
        idempotencyKey: command.idempotencyKey,
      };
    }

    const result = await this.executeDepositCore(tx, command, logCtx);

    const response: DepositResponseDto = {
      ...result,
      idempotencyKey: command.idempotencyKey,
    };

    // Último paso de la TX: responseBody solo visible tras COMMIT junto al ledger.
    await this.depositRepository.completeIdempotency(
      tx,
      claim.record.id,
      {
        responseStatus: 201,
        responseBody: response as unknown as Prisma.InputJsonValue,
        transactionGroupId: result.transactionGroupId,
      },
      logCtx,
    );

    this.logger.log({
      event: 'deposit.completed',
      correlationId: command.correlationId,
      walletId: result.walletId,
      transactionGroupId: result.transactionGroupId,
      ledgerEntryId: result.ledgerEntryId,
      amount: command.amount.toString(),
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      idempotencyKey: command.idempotencyKey,
    });

    return response;
  }

  /**
   * Orden atómico (claim ya hecho — ledger solo si kind === execute):
   *   lock wallet(s) asc
   *   create transaction_group (PENDING)
   *   create ledger_entry (append-only)
   *   update wallet projection
   *   complete transaction_group
   * (complete idempotency — fuera, último en executeSerializableDeposit)
   */
  private async executeDepositCore(
    tx: Prisma.TransactionClient,
    command: DepositCommand,
    logCtx: RepositoryLogContext,
  ): Promise<Omit<DepositResponseDto, 'idempotencyKey'>> {
    const wallet = await this.depositRepository.lockWallet(
      tx,
      command.walletId,
      logCtx,
    );

    this.logger.log({
      event: 'deposit.lock_acquired',
      walletId: wallet.id,
      version: wallet.version,
      correlationId: command.correlationId,
    });

    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(wallet.id, wallet.status);
    }

    if (command.amount.lte(0) || !command.amount.isFinite()) {
      throw new InvalidAmountException();
    }

    const balanceBefore = wallet.currentBalance;
    const balanceAfter = balanceBefore.add(command.amount);

    const groupMetadata: Prisma.InputJsonValue | undefined =
      command.correlationId || command.referenceId
        ? {
            correlationId: command.correlationId,
            referenceId: command.referenceId,
          }
        : undefined;

    const group = await this.depositRepository.createTransactionGroupPending(
      tx,
      {
        correlationId: command.correlationId,
        businessReference: command.referenceId,
        metadata: groupMetadata,
      },
    );

    const entry = await this.depositRepository.createLedgerEntry(
      tx,
      {
        walletId: wallet.id,
        currency: wallet.currency,
        amount: command.amount,
        balanceBefore,
        balanceAfter,
        transactionGroupId: group.id,
        correlationId: command.correlationId,
        referenceId: command.referenceId,
      },
      logCtx,
    );

    const updatedCount = await this.depositRepository.updateWalletProjection(
      tx,
      wallet.id,
      wallet.version,
      balanceAfter,
    );

    if (updatedCount !== 1) {
      throw new ConcurrencyConflictException(wallet.id);
    }

    await this.depositRepository.completeTransactionGroup(tx, group.id, logCtx);

    return {
      transactionGroupId: group.id,
      ledgerEntryId: entry.id,
      walletId: wallet.id,
      currency: wallet.currency,
      amount: command.amount.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: balanceAfter.toFixed(2),
      status: 'COMPLETED',
    };
  }
}
