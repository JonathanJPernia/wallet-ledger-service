import { OperationType, Prisma } from '@prisma/client';

const CREDIT_TYPES: OperationType[] = [
  OperationType.DEPOSIT,
  OperationType.TRANSFER_IN,
  OperationType.FEE_IN,
];

const DEBIT_TYPES: OperationType[] = [
  OperationType.WITHDRAW,
  OperationType.TRANSFER_OUT,
  OperationType.FEE_OUT,
];

export function signedLedgerAmount(
  operationType: OperationType,
  amount: Prisma.Decimal,
): string {
  if (CREDIT_TYPES.includes(operationType)) {
    return amount.toFixed(2);
  }
  if (DEBIT_TYPES.includes(operationType)) {
    return amount.neg().toFixed(2);
  }
  return new Prisma.Decimal(0).toFixed(2);
}
