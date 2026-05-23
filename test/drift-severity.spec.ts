import { Prisma } from '@prisma/client';
import {
  classifyDriftSeverity,
  shouldAutoRepair,
} from '../src/modules/reconciliation/utils/drift-severity.util';

describe('drift-severity', () => {
  it('classifies NONE for sub-cent drift', () => {
    expect(classifyDriftSeverity(new Prisma.Decimal('0.001'))).toBe('NONE');
  });

  it('classifies LOW', () => {
    expect(classifyDriftSeverity(new Prisma.Decimal('0.50'))).toBe('LOW');
  });

  it('classifies MEDIUM', () => {
    expect(classifyDriftSeverity(new Prisma.Decimal('10'))).toBe('MEDIUM');
  });

  it('classifies CRITICAL', () => {
    expect(classifyDriftSeverity(new Prisma.Decimal('500'))).toBe('CRITICAL');
  });

  it('auto-repair only for LOW when env enabled', () => {
    const prev = process.env.RECONCILIATION_AUTO_REPAIR;
    process.env.RECONCILIATION_AUTO_REPAIR = 'true';
    expect(shouldAutoRepair('LOW')).toBe(true);
    expect(shouldAutoRepair('MEDIUM')).toBe(false);
    process.env.RECONCILIATION_AUTO_REPAIR = prev;
  });
});
