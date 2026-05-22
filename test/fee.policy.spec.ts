import { Prisma } from '@prisma/client';
import {
  calculateFee,
  FeeableOperation,
  totalDebitFromPayer,
} from '../src/modules/fees/fee.policy';

describe('fee.policy', () => {
  it('charges 0.5% on transfer', () => {
    expect(
      calculateFee(FeeableOperation.TRANSFER, new Prisma.Decimal(100)).toFixed(2),
    ).toBe('0.50');
  });

  it('charges 1% on withdraw', () => {
    expect(
      calculateFee(FeeableOperation.WITHDRAW, new Prisma.Decimal(50)).toFixed(2),
    ).toBe('0.50');
  });

  it('charges 0 on deposit', () => {
    expect(calculateFee(FeeableOperation.DEPOSIT, new Prisma.Decimal(100)).toString()).toBe(
      '0',
    );
  });

  it('sums base + fee for payer debit', () => {
    const base = new Prisma.Decimal(100);
    const fee = new Prisma.Decimal('0.50');
    expect(totalDebitFromPayer(base, fee).toFixed(2)).toBe('100.50');
  });
});
