import { SNAPSHOT_CORRECTION_WINDOW_DAYS } from '../constants';
import { utcDayBounds } from './reporting-date.util';

export type SnapshotPersistDecision =
  | { action: 'insert' }
  | { action: 'skip'; reason: 'immutable_exists' }
  | { action: 'refresh'; reason: 'correction_window' };

/**
 * Snapshots fuera de la ventana de corrección: append-only (nunca update).
 * Dentro de la ventana: refresh permitido para late-arriving ledger rows.
 */
export function decideSnapshotPersist(
  snapshotDate: Date,
  exists: boolean,
  now: Date = new Date(),
  correctionWindowDays = SNAPSHOT_CORRECTION_WINDOW_DAYS,
): SnapshotPersistDecision {
  if (!exists) {
    return { action: 'insert' };
  }

  const correctionStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - correctionWindowDays,
    ),
  );

  const { start: snapshotDayStart } = utcDayBounds(snapshotDate);

  if (snapshotDayStart < correctionStart) {
    return { action: 'skip', reason: 'immutable_exists' };
  }

  return { action: 'refresh', reason: 'correction_window' };
}

export function assertSnapshotTotalsMatchLedger(input: {
  snapshotFeeRevenue: string;
  ledgerFeeRevenue: string;
}): boolean {
  return input.snapshotFeeRevenue === input.ledgerFeeRevenue;
}
