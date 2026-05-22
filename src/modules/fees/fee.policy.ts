import { Prisma } from '@prisma/client';

export enum FeeableOperation {
  DEPOSIT = 'DEPOSIT',
  TRANSFER = 'TRANSFER',
  WITHDRAW = 'WITHDRAW',
}

/** Porcentaje en decimal (0.005 = 0.5%). */
const FEE_RATE: Record<FeeableOperation, number> = {
  [FeeableOperation.DEPOSIT]: 0,
  [FeeableOperation.TRANSFER]: 0.005,
  [FeeableOperation.WITHDRAW]: 0.01,
};

export function calculateFee(
  operation: FeeableOperation,
  baseAmount: Prisma.Decimal,
): Prisma.Decimal {
  const rate = FEE_RATE[operation];
  if (rate <= 0) {
    return new Prisma.Decimal(0);
  }

  return baseAmount
    .mul(rate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function totalDebitFromPayer(
  baseAmount: Prisma.Decimal,
  feeAmount: Prisma.Decimal,
): Prisma.Decimal {
  return baseAmount.add(feeAmount);
}
