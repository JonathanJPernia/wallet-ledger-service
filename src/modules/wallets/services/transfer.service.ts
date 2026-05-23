import { Injectable, Logger } from '@nestjs/common';
import { OperationType, Prisma, WalletKind, WalletStatus } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import {
  ConcurrencyConflictException,
  CurrencyMismatchException,
  IdempotencyConflictException,
  InsufficientFundsException,
  InvalidAmountException,
  SameWalletTransferException,
  SystemWalletNotAllowedException,
  WalletNotActiveException,
  WalletNotFoundException,
} from '../../../common/errors/financial.exceptions';
import {
  assertValidTransferResponseForPersist,
  isValidTransferResponse,
  rebuildTransferResponseFromLedger,
} from '../../../common/database/idempotency-response-guard';
import { FeeableOperation } from '../../fees/fee.policy';
import { payerHasSufficientFundsForIntent } from '../../fees/fee-intent';
import { FeesService } from '../../fees/fees.service';
import { SystemFeeWalletService } from '../../fees/system-fee-wallet.service';
import type { TransferBodyDto } from '../dto/transfer-body.dto';
import { TransferResponseDto } from '../dto/transfer-response.dto';
import {
  failureErrorCodeFromError,
  failureReasonFromError,
  shouldPersistIdempotencyFailure,
} from '../../../common/database/idempotency-failure';
import { MetricsService } from '../../../common/observability/metrics.service';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';
import { FinancialEventsService } from '../../events/services/financial-events.service';
import { RiskScoringService } from '../../risk/services/risk-scoring.service';
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

  constructor(
    private readonly transferRepository: TransferRepository,
    private readonly feesService: FeesService,
    private readonly systemFeeWalletService: SystemFeeWalletService,
    private readonly riskScoringService: RiskScoringService,
    private readonly financialEventsService: FinancialEventsService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly metrics: MetricsService,
  ) {}

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
    if (safeReplay?.responseBody && safeReplay.transactionGroupId) {
      const body = safeReplay.responseBody;
      if (isValidTransferResponse(body)) {
        const data: TransferResponseDto = {
          ...(body as TransferResponseDto),
          idempotencyKey: command.idempotencyKey,
        };
        this.metrics.recordIdempotencyReplay(scope);
        this.logger.log({
          event: 'transfer.idempotency_replay',
          source: 'safe_committed_fast_path',
          idempotencyKey: command.idempotencyKey,
          transferId: safeReplay.transactionGroupId,
          correlationId: command.correlationId,
        });
        return buildApiResponse(data);
      }
      this.logger.warn({
        event: 'transfer.idempotency_invalid_snapshot',
        source: 'safe_committed_fast_path',
        idempotencyKey: command.idempotencyKey,
        transactionGroupId: safeReplay.transactionGroupId,
      });
    }

    await this.circuitBreaker.assertWalletOperational(
      command.fromWalletId,
      'transfer',
      command.correlationId,
    );

    await this.riskScoringService.assertWalletAllowed(
      command.fromWalletId,
      'transfer',
    );

    try {
      const result = await this.transferRepository.runSerializable((tx) =>
        this.executeSerializableTransfer(tx, command, scope, logCtx),
      );

      await this.circuitBreaker.recordSuccess('wallet', command.fromWalletId);
      this.metrics.recordFinancialOperation('transfer', 'success');
      return buildApiResponse(result);
    } catch (error) {
      if (this.circuitBreaker.isInfrastructureFailure(error)) {
        await this.circuitBreaker.recordFailure(
          'wallet',
          command.fromWalletId,
          command.correlationId,
        );
      }
      this.metrics.recordFinancialOperation('transfer', 'failure');
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
      const replayed = await this.resolveTransferReplay(
        tx,
        claim.record.responseBody,
        claim.record.transactionGroupId,
        command.idempotencyKey,
      );
      this.logger.log({
        event: 'transfer.idempotency_replay',
        source: 'serializable_tx',
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        replaySource: isValidTransferResponse(claim.record.responseBody)
          ? 'response_body'
          : 'ledger_rebuild',
      });
      return replayed;
    }

    const result = await this.executeTransferCore(tx, command, logCtx);

    const response: TransferResponseDto = {
      ...result,
      idempotencyKey: command.idempotencyKey,
    };

    assertValidTransferResponseForPersist(response);

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
   * 5. fee FEE_OUT + FEE_IN (same group, sender debited base + fee)
   * 6. projections (from, to, SYSTEM_FEE_WALLET)
   * 7. group COMPLETED
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

    const { from, to, feeWallet } =
      await this.lockTransferParties(tx, command, logCtx);

    this.logger.log({
      event: 'transfer.wallets_locked',
      fromWalletId: from.id,
      toWalletId: to.id,
      feeWalletId: feeWallet.id,
      correlationId: command.correlationId,
    });

    this.assertUserWalletForTransfer(from.id, from.kind, 'transfer');
    this.assertUserWalletForTransfer(to.id, to.kind, 'transfer');

    if (from.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(from.id, from.status);
    }
    if (to.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(to.id, to.status);
    }
    if (feeWallet.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(feeWallet.id, feeWallet.status);
    }

    if (from.currency !== to.currency) {
      throw new CurrencyMismatchException(from.currency, to.currency);
    }
    if (from.currency !== feeWallet.currency) {
      throw new CurrencyMismatchException(from.currency, feeWallet.currency);
    }

    const fromBefore = from.currentBalance;
    const toBefore = to.currentBalance;

    const intent = this.feesService.buildFeeIntent({
      operation: FeeableOperation.TRANSFER,
      baseAmount: command.amount,
      payerBalanceBefore: fromBefore,
      feeWalletBalanceBefore: feeWallet.currentBalance,
    });

    if (!payerHasSufficientFundsForIntent(intent)) {
      throw new InsufficientFundsException(from.id);
    }

    const fromAfterTransfer = intent.payerBalanceAfterPrincipal;
    const toAfter = toBefore.add(command.amount);

    const groupMetadata: Prisma.InputJsonValue = {
      fromWalletId: from.id,
      toWalletId: to.id,
      baseAmount: intent.baseAmount.toString(),
      feeAmount: intent.feeAmount.toString(),
      totalDeducted: intent.totalDebit.toString(),
      feeWalletId: feeWallet.id,
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
        balanceAfter: fromAfterTransfer,
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

    const feeResult = await this.feesService.applyFee({
      tx,
      intent,
      payerWallet: from,
      feeWallet,
      transactionGroupId: group.id,
      correlationId: command.correlationId,
      referenceId: command.referenceId,
    });

    this.logger.log({
      event: 'transfer.ledger_created',
      correlationId: command.correlationId,
      transferId: group.id,
      debitLedgerEntryId: debitEntry.id,
      creditLedgerEntryId: creditEntry.id,
      feeAmount: feeResult.feeAmount.toString(),
      feeOutLedgerEntryId: feeResult.feeOutLedgerEntryId,
      feeInLedgerEntryId: feeResult.feeInLedgerEntryId,
    });

    const fromUpdated = await this.transferRepository.updateWalletProjection(
      tx,
      from.id,
      from.version,
      feeResult.payerBalanceAfter,
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

    if (feeResult.feeAmount.gt(0)) {
      const feeUpdated = await this.transferRepository.updateWalletProjection(
        tx,
        feeWallet.id,
        feeWallet.version,
        feeResult.feeWalletBalanceAfter,
      );
      if (feeUpdated !== 1) {
        throw new ConcurrencyConflictException(feeWallet.id);
      }
    }

    await this.transferRepository.completeTransactionGroup(
      tx,
      group.id,
      logCtx,
    );

    await this.financialEventsService.recordTransferCompleted(tx, {
      fromWalletId: from.id,
      toWalletId: to.id,
      transactionGroupId: group.id,
      amount: command.amount,
      currency: from.currency,
      feeAmount: intent.feeAmount,
      correlationId: command.correlationId,
    });

    return {
      transferId: group.id,
      fromWalletId: from.id,
      toWalletId: to.id,
      amount: command.amount.toFixed(2),
      baseAmount: command.amount.toFixed(2),
      feeAmount: intent.feeAmount.toFixed(2),
      totalDeducted: intent.totalDebit.toFixed(2),
      fromBalanceBefore: fromBefore.toFixed(2),
      fromBalanceAfter: feeResult.payerBalanceAfter.toFixed(2),
      toBalanceBefore: toBefore.toFixed(2),
      toBalanceAfter: toAfter.toFixed(2),
      systemFeeWalletBalanceAfter: feeResult.feeWalletBalanceAfter.toFixed(2),
      status: 'COMPLETED',
    };
  }

  private async lockTransferParties(
    tx: Prisma.TransactionClient,
    command: TransferCommand,
    logCtx: TransferRepositoryLogContext,
  ) {
    const fromMeta = await tx.wallet.findUnique({
      where: { id: command.fromWalletId },
      select: { currency: true },
    });
    if (!fromMeta) {
      throw new WalletNotFoundException(command.fromWalletId);
    }

    const feeWalletId = await this.systemFeeWalletService.getSystemFeeWalletId(
      fromMeta.currency,
    );

    return this.transferRepository.lockTransferParties(
      tx,
      command.fromWalletId,
      command.toWalletId,
      feeWalletId,
      logCtx,
    );
  }

  private async resolveTransferReplay(
    tx: Prisma.TransactionClient,
    responseBody: unknown,
    transactionGroupId: string | null,
    idempotencyKey: string,
  ): Promise<TransferResponseDto> {
    if (isValidTransferResponse(responseBody)) {
      return { ...responseBody, idempotencyKey };
    }

    if (!transactionGroupId) {
      throw new IdempotencyConflictException(
        idempotencyKey,
        'COMPLETED idempotency without transactionGroupId',
      );
    }

    const rebuilt = await rebuildTransferResponseFromLedger(
      tx,
      transactionGroupId,
      idempotencyKey,
    );
    if (rebuilt) {
      return rebuilt;
    }

    throw new IdempotencyConflictException(
      idempotencyKey,
      'Invalid idempotency snapshot; ledger rebuild failed',
    );
  }

  private assertUserWalletForTransfer(
    walletId: string,
    kind: WalletKind,
    operation: string,
  ): void {
    if (this.systemFeeWalletService.isSystemFeeWalletKind(kind)) {
      throw new SystemWalletNotAllowedException(walletId, operation);
    }
  }
}
