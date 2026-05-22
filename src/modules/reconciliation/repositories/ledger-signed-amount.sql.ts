import { Prisma } from '@prisma/client';

/**
 * Mapping explícito ledger ↔ saldo (debe alinearse con OperationType en schema.prisma).
 *
 * Al agregar tipos nuevos (FEE_WITHDRAW, REVERSAL, etc.):
 * 1. Añadir WHEN aquí con semántica +/-
 * 2. Actualizar tests en ledger-signed-amount.spec.ts
 * 3. Nunca usar ELSE -amount (evita drift falso)
 */
export const LEDGER_SIGNED_OPERATION_TYPES = [
  'DEPOSIT',
  'TRANSFER_IN',
  'WITHDRAW',
  'TRANSFER_OUT',
  'FEE_IN',
  'FEE_OUT',
] as const;

export function ledgerSignedAmountExpression() {
  return Prisma.sql`
    CASE "operationType"::text
      WHEN 'DEPOSIT' THEN amount
      WHEN 'TRANSFER_IN' THEN amount
      WHEN 'FEE_IN' THEN amount
      WHEN 'WITHDRAW' THEN -amount
      WHEN 'TRANSFER_OUT' THEN -amount
      WHEN 'FEE_OUT' THEN -amount
      ELSE 0
    END
  `;
}
