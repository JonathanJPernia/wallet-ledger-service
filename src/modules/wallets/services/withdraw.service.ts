import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WalletStatus } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import {
  failureErrorCodeFromError,
  failureReasonFromError,
  shouldPersistIdempotencyFailure,
} from '../../../common/database/idempotency-failure';
import {
  logInsufficientFunds,
  logOperationFailed,
} from '../../../common/observability/financial-operation-log';
import {
  ConcurrencyConflictException,
  CurrencyMismatchException,
  IdempotencyConflictException,
  InsufficientFundsException,
  InvalidAmountException,
  SystemWalletNotAllowedException,
  WalletNotActiveException,
  WalletNotFoundException,
} from '../../../common/errors/financial.exceptions';
import {
  assertValidWithdrawResponseForPersist,
  isValidWithdrawResponse,
  rebuildWithdrawResponseFromLedger,
} from '../../../common/database/idempotency-response-guard';
import { FeeableOperation } from '../../fees/fee.policy';
import { payerHasSufficientFundsForIntent } from '../../fees/fee-intent';
import { FeesService } from '../../fees/fees.service';
import { SystemFeeWalletService } from '../../fees/system-fee-wallet.service';
import type { WithdrawBodyDto } from '../dto/withdraw-body.dto';
import { WithdrawResponseDto } from '../dto/withdraw-response.dto';
import {
  WithdrawRepository,
  type WithdrawRepositoryLogContext,
} from '../repositories/withdraw.repository';

export const WITHDRAW_IDEMPOTENCY_SCOPE = 'wallet.withdraw';
export const IDEMPOTENCY_TTL_HOURS = 24;

export type WithdrawCommand = {
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
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private readonly withdrawRepository: WithdrawRepository,
    private readonly feesService: FeesService,
    private readonly systemFeeWalletService: SystemFeeWalletService,
  ) {}

  async withdraw(
    command: WithdrawCommand,
  ): Promise<ApiResponseDto<WithdrawResponseDto>> {
    const scope = WITHDRAW_IDEMPOTENCY_SCOPE;
    const logCtx: WithdrawRepositoryLogContext = {
      correlationId: command.correlationId,
      idempotencyKey: command.idempotencyKey,
      walletId: command.walletId,
    };

    this.logger.log({
      event: 'withdraw.started',
      walletId: command.walletId,
      amount: command.amount.toString(),
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
    });

    const safeReplay = await this.withdrawRepository.findSafeCommittedReplay(
      scope,
      command.idempotencyKey,
      logCtx,
    );
    if (safeReplay?.responseBody && safeReplay.transactionGroupId) {
      const body = safeReplay.responseBody;
      if (isValidWithdrawResponse(body)) {
        const data: WithdrawResponseDto = {
          ...(body as WithdrawResponseDto),
          idempotencyKey: command.idempotencyKey,
        };
        this.logger.log({
          event: 'withdraw.idempotency_replay',
          source: 'safe_committed_fast_path',
          idempotencyKey: command.idempotencyKey,
          withdrawId: safeReplay.transactionGroupId,
          correlationId: command.correlationId,
        });
        return buildApiResponse(data);
      }
      this.logger.warn({
        event: 'withdraw.idempotency_invalid_snapshot',
        source: 'safe_committed_fast_path',
        idempotencyKey: command.idempotencyKey,
        transactionGroupId: safeReplay.transactionGroupId,
      });
    }

    try {
      const result = await this.withdrawRepository.runSerializable((tx) =>
        this.executeSerializableWithdraw(tx, command, scope, logCtx),
      );

      return buildApiResponse(result);
    } catch (error) {
      logOperationFailed(
        this.logger,
        {
          operation: 'withdraw',
          walletId: command.walletId,
          amount: command.amount.toString(),
          idempotencyKey: command.idempotencyKey,
          correlationId: command.correlationId,
        },
        error,
      );

      if (shouldPersistIdempotencyFailure(error)) {
        await this.withdrawRepository.recordIdempotencyFailureOutsideTx({
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

  withdrawFromHttp(
    walletId: string,
    body: WithdrawBodyDto,
    idempotencyKey: string,
    requestMeta: {
      method: string;
      path: string;
      requestHash: string;
      correlationId?: string;
    },
  ): Promise<ApiResponseDto<WithdrawResponseDto>> {
    return this.withdraw({
      walletId,
      amount: new Prisma.Decimal(body.amount),
      idempotencyKey,
      requestMethod: requestMeta.method,
      requestPath: requestMeta.path,
      requestHash: requestMeta.requestHash,
      referenceId: body.referenceId,
      correlationId: requestMeta.correlationId,
    });
  }

  private async executeSerializableWithdraw(
    tx: Prisma.TransactionClient,
    command: WithdrawCommand,
    scope: string,
    logCtx: WithdrawRepositoryLogContext,
  ): Promise<WithdrawResponseDto> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + IDEMPOTENCY_TTL_HOURS);

    const claim = await this.withdrawRepository.claimIdempotency(tx, {
      scope,
      key: command.idempotencyKey,
      requestHash: command.requestHash,
      requestMethod: command.requestMethod,
      requestPath: command.requestPath,
      expiresAt,
    });

    if (claim.kind === 'cached') {
      const replayed = await this.resolveWithdrawReplay(
        tx,
        claim.record.responseBody,
        claim.record.transactionGroupId,
        command.idempotencyKey,
      );
      this.logger.log({
        event: 'withdraw.idempotency_replay',
        source: 'serializable_tx',
        idempotencyKey: command.idempotencyKey,
        correlationId: command.correlationId,
        replaySource: isValidWithdrawResponse(claim.record.responseBody)
          ? 'response_body'
          : 'ledger_rebuild',
      });
      return replayed;
    }

    const result = await this.executeWithdrawCore(tx, command, logCtx);

    const response: WithdrawResponseDto = {
      ...result,
      idempotencyKey: command.idempotencyKey,
    };

    assertValidWithdrawResponseForPersist(response);

    await this.withdrawRepository.completeIdempotency(
      tx,
      claim.record.id,
      {
        responseStatus: 201,
        responseBody: response as unknown as Prisma.InputJsonValue,
        transactionGroupId: result.withdrawId,
      },
      logCtx,
    );

    this.logger.log({
      event: 'withdraw.completed',
      correlationId: command.correlationId,
      withdrawId: result.withdrawId,
      walletId: result.walletId,
      ledgerEntryId: result.ledgerEntryId,
      amount: command.amount.toString(),
      balanceBefore: result.balanceBefore,
      balanceAfter: result.balanceAfter,
      idempotencyKey: command.idempotencyKey,
    });

    return response;
  }

  /**
   * 1. lock wallet (FOR UPDATE)
   * 2. validate ACTIVE, amount, sufficient funds
   * 3. transaction_group WITHDRAW PENDING
   * 4. ledger WITHDRAW (amount > 0, semantic debit)
   * 5. fee FEE_OUT + FEE_IN (same group)
   * 6. projections (user wallet + SYSTEM_FEE_WALLET)
   * 7. group COMPLETED
   * (idempotency COMPLETED — último en executeSerializableWithdraw)
   */
  private async executeWithdrawCore(
    tx: Prisma.TransactionClient,
    command: WithdrawCommand,
    logCtx: WithdrawRepositoryLogContext,
  ): Promise<Omit<WithdrawResponseDto, 'idempotencyKey'>> {
    const payerMeta = await tx.wallet.findUnique({
      where: { id: command.walletId },
      select: { currency: true },
    });
    if (!payerMeta) {
      throw new WalletNotFoundException(command.walletId);
    }

    const feeWalletId = await this.systemFeeWalletService.getSystemFeeWalletId(
      payerMeta.currency,
    );

    const { wallet, feeWallet } =
      await this.withdrawRepository.lockWithdrawParties(
        tx,
        command.walletId,
        feeWalletId,
        logCtx,
      );

    this.logger.log({
      event: 'withdraw.wallet_locked',
      walletId: wallet.id,
      feeWalletId: feeWallet.id,
      version: wallet.version,
      correlationId: command.correlationId,
    });

    if (this.systemFeeWalletService.isSystemFeeWalletKind(wallet.kind)) {
      throw new SystemWalletNotAllowedException(wallet.id, 'withdraw');
    }

    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(wallet.id, wallet.status);
    }
    if (feeWallet.status !== WalletStatus.ACTIVE) {
      throw new WalletNotActiveException(feeWallet.id, feeWallet.status);
    }

    if (command.amount.lte(0) || !command.amount.isFinite()) {
      throw new InvalidAmountException();
    }

    if (wallet.currency !== feeWallet.currency) {
      throw new CurrencyMismatchException(wallet.currency, feeWallet.currency);
    }

    const balanceBefore = wallet.currentBalance;

    const intent = this.feesService.buildFeeIntent({
      operation: FeeableOperation.WITHDRAW,
      baseAmount: command.amount,
      payerBalanceBefore: balanceBefore,
      feeWalletBalanceBefore: feeWallet.currentBalance,
    });

    if (!payerHasSufficientFundsForIntent(intent)) {
      logInsufficientFunds(
        this.logger,
        {
          operation: 'withdraw',
          walletId: command.walletId,
          amount: command.amount.toString(),
          idempotencyKey: command.idempotencyKey,
          correlationId: command.correlationId,
        },
        wallet.id,
        balanceBefore.toString(),
        intent.totalDebit.toString(),
      );
      throw new InsufficientFundsException(wallet.id);
    }

    const balanceAfterWithdraw = intent.payerBalanceAfterPrincipal;

    const groupMetadata: Prisma.InputJsonValue = {
      baseAmount: intent.baseAmount.toString(),
      feeAmount: intent.feeAmount.toString(),
      totalDeducted: intent.totalDebit.toString(),
      feeWalletId: feeWallet.id,
      ...(command.correlationId ? { correlationId: command.correlationId } : {}),
      ...(command.referenceId ? { referenceId: command.referenceId } : {}),
    };

    const group = await this.withdrawRepository.createTransactionGroupPending(
      tx,
      {
        correlationId: command.correlationId,
        businessReference: command.referenceId,
        metadata: groupMetadata,
      },
    );

    const entry = await this.withdrawRepository.createLedgerEntry(
      tx,
      {
        walletId: wallet.id,
        currency: wallet.currency,
        amount: command.amount,
        balanceBefore,
        balanceAfter: balanceAfterWithdraw,
        transactionGroupId: group.id,
        correlationId: command.correlationId,
        referenceId: command.referenceId,
      },
      logCtx,
    );

    const feeResult = await this.feesService.applyFee({
      tx,
      intent,
      payerWallet: wallet,
      feeWallet,
      transactionGroupId: group.id,
      correlationId: command.correlationId,
      referenceId: command.referenceId,
    });

    this.logger.log({
      event: 'withdraw.ledger_created',
      correlationId: command.correlationId,
      withdrawId: group.id,
      ledgerEntryId: entry.id,
      walletId: wallet.id,
      feeAmount: feeResult.feeAmount.toString(),
      feeOutLedgerEntryId: feeResult.feeOutLedgerEntryId,
      feeInLedgerEntryId: feeResult.feeInLedgerEntryId,
    });

    const updatedCount = await this.withdrawRepository.updateWalletProjection(
      tx,
      wallet.id,
      wallet.version,
      feeResult.payerBalanceAfter,
    );

    if (updatedCount !== 1) {
      throw new ConcurrencyConflictException(wallet.id);
    }

    if (feeResult.feeAmount.gt(0)) {
      const feeUpdated = await this.withdrawRepository.updateWalletProjection(
        tx,
        feeWallet.id,
        feeWallet.version,
        feeResult.feeWalletBalanceAfter,
      );
      if (feeUpdated !== 1) {
        throw new ConcurrencyConflictException(feeWallet.id);
      }
    }

    await this.withdrawRepository.completeTransactionGroup(
      tx,
      group.id,
      logCtx,
    );

    return {
      withdrawId: group.id,
      ledgerEntryId: entry.id,
      walletId: wallet.id,
      currency: wallet.currency,
      amount: command.amount.toFixed(2),
      baseAmount: command.amount.toFixed(2),
      feeAmount: intent.feeAmount.toFixed(2),
      totalDeducted: intent.totalDebit.toFixed(2),
      balanceBefore: balanceBefore.toFixed(2),
      balanceAfter: feeResult.payerBalanceAfter.toFixed(2),
      systemFeeWalletBalanceAfter: feeResult.feeWalletBalanceAfter.toFixed(2),
      status: 'COMPLETED',
    };
  }

  private async resolveWithdrawReplay(
    tx: Prisma.TransactionClient,
    responseBody: unknown,
    transactionGroupId: string | null,
    idempotencyKey: string,
  ): Promise<WithdrawResponseDto> {
    if (isValidWithdrawResponse(responseBody)) {
      return { ...responseBody, idempotencyKey };
    }

    if (!transactionGroupId) {
      throw new IdempotencyConflictException(
        idempotencyKey,
        'COMPLETED idempotency without transactionGroupId',
      );
    }

    const rebuilt = await rebuildWithdrawResponseFromLedger(
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
}
