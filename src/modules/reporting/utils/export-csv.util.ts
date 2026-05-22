import type { LedgerExportRow } from '../repositories/reporting.repository';

export const WALLET_LEDGER_CSV_HEADER =
  'walletId,operationType,amount,currency,balanceBefore,balanceAfter,createdAt,transactionGroupId,correlationId';

export const REVENUE_CSV_HEADER =
  'createdAt,amount,currency,transactionGroupId,groupType,correlationId';

export function formatWalletLedgerRow(r: LedgerExportRow): string {
  return `${r.walletId},${r.operationType},${r.amount},${r.currency},${r.balanceBefore},${r.balanceAfter},${r.createdAt.toISOString()},${r.transactionGroupId ?? ''},${r.correlationId ?? ''}`;
}

export function formatRevenueRow(r: {
  createdAt: Date;
  amount: unknown;
  currency: string;
  transactionGroupId: string | null;
  groupType: string;
  correlationId: string | null;
}): string {
  return `${r.createdAt.toISOString()},${r.amount},${r.currency},${r.transactionGroupId ?? ''},${r.groupType},${r.correlationId ?? ''}`;
}

/** Acumula chunks sin guardar todas las filas a la vez. */
export function appendCsvChunks(
  parts: string[],
  header: string,
  rowLines: string[],
): void {
  if (parts.length === 0) {
    parts.push(header);
  }
  parts.push(...rowLines);
}
