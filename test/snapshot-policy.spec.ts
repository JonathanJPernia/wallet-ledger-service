import {
  assertSnapshotTotalsMatchLedger,
  decideSnapshotPersist,
} from '../src/modules/reporting/utils/snapshot-policy';

describe('snapshot-policy', () => {
  const now = new Date('2026-05-22T12:00:00.000Z');

  it('inserts when snapshot does not exist', () => {
    expect(
      decideSnapshotPersist(new Date('2026-05-20'), false, now).action,
    ).toBe('insert');
  });

  it('skips immutable snapshot outside correction window', () => {
    const oldDay = new Date('2026-05-01');
    expect(decideSnapshotPersist(oldDay, true, now).action).toBe('skip');
    expect(decideSnapshotPersist(oldDay, true, now).reason).toBe(
      'immutable_exists',
    );
  });

  it('allows refresh inside correction window when exists', () => {
    const recentDay = new Date('2026-05-20');
    expect(decideSnapshotPersist(recentDay, true, now).action).toBe('refresh');
  });

  it('validates snapshot fee equals ledger fee string', () => {
    expect(
      assertSnapshotTotalsMatchLedger({
        snapshotFeeRevenue: '125.50',
        ledgerFeeRevenue: '125.50',
      }),
    ).toBe(true);
    expect(
      assertSnapshotTotalsMatchLedger({
        snapshotFeeRevenue: '100.00',
        ledgerFeeRevenue: '100.01',
      }),
    ).toBe(false);
  });
});
