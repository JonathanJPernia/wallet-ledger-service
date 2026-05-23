import { Prisma } from '@prisma/client';

export type DriftSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL';

/** Umbrales absolutos en unidad de moneda (2 decimales). */
const LOW_THRESHOLD = new Prisma.Decimal('0.01');
const MEDIUM_THRESHOLD = new Prisma.Decimal('1');
const CRITICAL_THRESHOLD = new Prisma.Decimal('100');

export function classifyDriftSeverity(
  difference: Prisma.Decimal,
): DriftSeverity {
  const abs = difference.abs();

  if (abs.lt(LOW_THRESHOLD)) {
    return 'NONE';
  }
  if (abs.lt(MEDIUM_THRESHOLD)) {
    return 'LOW';
  }
  if (abs.lt(CRITICAL_THRESHOLD)) {
    return 'MEDIUM';
  }
  return 'CRITICAL';
}

export function shouldAutoRepair(severity: DriftSeverity): boolean {
  return (
    process.env.RECONCILIATION_AUTO_REPAIR === 'true' && severity === 'LOW'
  );
}
