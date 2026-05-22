import { Prisma } from '@prisma/client';
import { calculateFee, FeeableOperation, totalDebitFromPayer } from './fee.policy';

/**
 * Intent pre-commit: montos derivados ANTES de cualquier ledger write.
 * Evita acoplar el fee a estado post-mutación implícito en applyFee.
 */
export type FeeIntent = {
  operation: FeeableOperation;
  baseAmount: Prisma.Decimal;
  feeAmount: Prisma.Decimal;
  totalDebit: Prisma.Decimal;
  payerBalanceBefore: Prisma.Decimal;
  payerBalanceAfterPrincipal: Prisma.Decimal;
  payerBalanceAfterFee: Prisma.Decimal;
  feeWalletBalanceBefore: Prisma.Decimal;
  feeWalletBalanceAfter: Prisma.Decimal;
};

export function buildFeeIntent(input: {
  operation: FeeableOperation;
  baseAmount: Prisma.Decimal;
  payerBalanceBefore: Prisma.Decimal;
  feeWalletBalanceBefore: Prisma.Decimal;
}): FeeIntent {
  const feeAmount = calculateFee(input.operation, input.baseAmount);
  const totalDebit = totalDebitFromPayer(input.baseAmount, feeAmount);
  const payerBalanceAfterPrincipal = input.payerBalanceBefore.sub(
    input.baseAmount,
  );
  const payerBalanceAfterFee = input.payerBalanceBefore.sub(totalDebit);
  const feeWalletBalanceAfter = input.feeWalletBalanceBefore.add(feeAmount);

  return {
    operation: input.operation,
    baseAmount: input.baseAmount,
    feeAmount,
    totalDebit,
    payerBalanceBefore: input.payerBalanceBefore,
    payerBalanceAfterPrincipal,
    payerBalanceAfterFee,
    feeWalletBalanceBefore: input.feeWalletBalanceBefore,
    feeWalletBalanceAfter,
  };
}

export function payerHasSufficientFundsForIntent(intent: FeeIntent): boolean {
  return intent.payerBalanceBefore.gte(intent.totalDebit);
}
