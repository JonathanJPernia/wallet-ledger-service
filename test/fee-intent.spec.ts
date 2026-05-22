import { Prisma } from '@prisma/client';
import {
  buildFeeIntent,
  payerHasSufficientFundsForIntent,
} from '../src/modules/fees/fee-intent';
import { FeeableOperation } from '../src/modules/fees/fee.policy';

describe('buildFeeIntent', () => {
  it('derives all balances pre-commit from payer balance before', () => {
    const intent = buildFeeIntent({
      operation: FeeableOperation.TRANSFER,
      baseAmount: new Prisma.Decimal(100),
      payerBalanceBefore: new Prisma.Decimal(200),
      feeWalletBalanceBefore: new Prisma.Decimal(10),
    });

    expect(intent.feeAmount.toFixed(2)).toBe('0.50');
    expect(intent.totalDebit.toFixed(2)).toBe('100.50');
    expect(intent.payerBalanceAfterPrincipal.toFixed(2)).toBe('100.00');
    expect(intent.payerBalanceAfterFee.toFixed(2)).toBe('99.50');
    expect(intent.feeWalletBalanceAfter.toFixed(2)).toBe('10.50');
  });

  it('detects insufficient funds from intent', () => {
    const intent = buildFeeIntent({
      operation: FeeableOperation.WITHDRAW,
      baseAmount: new Prisma.Decimal(100),
      payerBalanceBefore: new Prisma.Decimal(100),
      feeWalletBalanceBefore: new Prisma.Decimal(0),
    });

    expect(payerHasSufficientFundsForIntent(intent)).toBe(false);
  });
});
