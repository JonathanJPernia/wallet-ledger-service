import { Injectable, Logger } from '@nestjs/common';
import { OperationType, Prisma } from '@prisma/client';
import type { LockedWalletRow } from '../../common/database/wallet-lock';
import { calculateFee, FeeableOperation } from './fee.policy';
import type { FeeIntent } from './fee-intent';
import { buildFeeIntent } from './fee-intent';
import { FeesRepository } from './fees.repository';

export type ApplyFeeInput = {
  tx: Prisma.TransactionClient;
  intent: FeeIntent;
  payerWallet: LockedWalletRow;
  feeWallet: LockedWalletRow;
  transactionGroupId: string;
  correlationId?: string;
  referenceId?: string;
};

export type ApplyFeeResult = {
  feeAmount: Prisma.Decimal;
  payerBalanceAfter: Prisma.Decimal;
  feeWalletBalanceAfter: Prisma.Decimal;
  feeOutLedgerEntryId?: string;
  feeInLedgerEntryId?: string;
};

@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(private readonly feesRepository: FeesRepository) {}

  calculateFee(operation: FeeableOperation, baseAmount: Prisma.Decimal) {
    return calculateFee(operation, baseAmount);
  }

  buildFeeIntent(input: {
    operation: FeeableOperation;
    baseAmount: Prisma.Decimal;
    payerBalanceBefore: Prisma.Decimal;
    feeWalletBalanceBefore: Prisma.Decimal;
  }): FeeIntent {
    return buildFeeIntent(input);
  }

  /**
   * Persiste FEE_OUT + FEE_IN según intent pre-commit (sin re-derivar desde estado mutado).
   */
  async applyFee(input: ApplyFeeInput): Promise<ApplyFeeResult> {
    const { intent } = input;

    if (intent.feeAmount.lte(0)) {
      return {
        feeAmount: intent.feeAmount,
        payerBalanceAfter: intent.payerBalanceAfterPrincipal,
        feeWalletBalanceAfter: intent.feeWalletBalanceBefore,
      };
    }

    const feeOut = await this.feesRepository.createLedgerEntry(input.tx, {
      walletId: input.payerWallet.id,
      currency: input.payerWallet.currency,
      operationType: OperationType.FEE_OUT,
      amount: intent.feeAmount,
      balanceBefore: intent.payerBalanceAfterPrincipal,
      balanceAfter: intent.payerBalanceAfterFee,
      transactionGroupId: input.transactionGroupId,
      correlationId: input.correlationId,
      referenceId: input.referenceId,
    });

    const feeIn = await this.feesRepository.createLedgerEntry(input.tx, {
      walletId: input.feeWallet.id,
      currency: input.feeWallet.currency,
      operationType: OperationType.FEE_IN,
      amount: intent.feeAmount,
      balanceBefore: intent.feeWalletBalanceBefore,
      balanceAfter: intent.feeWalletBalanceAfter,
      transactionGroupId: input.transactionGroupId,
      correlationId: input.correlationId,
      referenceId: input.referenceId,
    });

    this.logger.log({
      event: 'fees.applied',
      operation: intent.operation,
      transactionGroupId: input.transactionGroupId,
      feeAmount: intent.feeAmount.toString(),
      totalDebit: intent.totalDebit.toString(),
      payerWalletId: input.payerWallet.id,
      feeWalletId: input.feeWallet.id,
      correlationId: input.correlationId,
    });

    return {
      feeAmount: intent.feeAmount,
      payerBalanceAfter: intent.payerBalanceAfterFee,
      feeWalletBalanceAfter: intent.feeWalletBalanceAfter,
      feeOutLedgerEntryId: feeOut.id,
      feeInLedgerEntryId: feeIn.id,
    };
  }
}
