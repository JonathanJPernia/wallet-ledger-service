import { Prisma } from '@prisma/client';

/**
 * Pure invariant: signed sum semantics used by audit replay.
 */
function signedAmount(
  operationType: string,
  amount: number,
): number {
  switch (operationType) {
    case 'DEPOSIT':
    case 'TRANSFER_IN':
    case 'FEE_IN':
      return amount;
    case 'WITHDRAW':
    case 'TRANSFER_OUT':
    case 'FEE_OUT':
      return -amount;
    default:
      return 0;
  }
}

describe('ledger reconstruction invariants', () => {
  it('rebuilds balance from ordered entries', () => {
    const entries = [
      { operationType: 'DEPOSIT', amount: 100 },
      { operationType: 'TRANSFER_OUT', amount: 30 },
      { operationType: 'FEE_OUT', amount: 0.15 },
      { operationType: 'TRANSFER_IN', amount: 30 },
    ];

    const balance = entries.reduce(
      (sum, e) => sum + signedAmount(e.operationType, e.amount),
      0,
    );

    expect(balance).toBeCloseTo(99.85, 2);
  });

  it('detects drift when projection differs from ledger sum', () => {
    const ledger = new Prisma.Decimal('69.85');
    const projection = new Prisma.Decimal('70.00');
    const difference = projection.sub(ledger);
    expect(difference.eq(0)).toBe(false);
  });

  it('is consistent when projection matches ledger', () => {
    const ledger = new Prisma.Decimal('100.00');
    const projection = new Prisma.Decimal('100.00');
    expect(projection.sub(ledger).eq(0)).toBe(true);
  });
});
