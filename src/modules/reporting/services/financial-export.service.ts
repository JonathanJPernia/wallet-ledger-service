import { Injectable } from '@nestjs/common';
import { EXPORT_CHUNK_SIZE } from '../constants';
import { ReportingRepository } from '../repositories/reporting.repository';
import { resolveReportingRange } from '../utils/reporting-date.util';
import {
  appendCsvChunks,
  formatRevenueRow,
  formatWalletLedgerRow,
  REVENUE_CSV_HEADER,
  WALLET_LEDGER_CSV_HEADER,
} from '../utils/export-csv.util';
import type { ReportingPeriod } from '../reporting.types';

@Injectable()
export class FinancialExportService {
  constructor(private readonly reportingRepository: ReportingRepository) {}

  /**
   * Export por chunks (keyset pagination). Memoria O(chunk), no O(total rows).
   */
  async exportWalletLedgerCsv(
    walletId: string,
    input?: {
      startDate?: string;
      endDate?: string;
    },
  ): Promise<string> {
    const range =
      input?.startDate && input?.endDate
        ? {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          }
        : undefined;

    const parts: string[] = [];
    let cursor: { createdAt: Date; id: string } | null = null;

    for (;;) {
      const chunk = await this.reportingRepository.fetchWalletLedgerExportChunk(
        walletId,
        range,
        cursor,
      );

      if (chunk.length === 0) {
        break;
      }

      appendCsvChunks(
        parts,
        WALLET_LEDGER_CSV_HEADER,
        chunk.map(formatWalletLedgerRow),
      );

      const last = chunk[chunk.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };

      if (chunk.length < EXPORT_CHUNK_SIZE) {
        break;
      }
    }

    return parts.length > 0 ? parts.join('\n') : WALLET_LEDGER_CSV_HEADER;
  }

  async exportRevenueCsv(input: {
    period?: ReportingPeriod;
    startDate?: string;
    endDate?: string;
    currency?: string;
  }): Promise<string> {
    const { startDate, endDate } = resolveReportingRange(
      input.period ?? 'monthly',
      input.startDate,
      input.endDate,
    );

    const range = {
      startDate,
      endDate,
      currency: input.currency ?? 'USD',
    };

    const parts: string[] = [];
    let cursor: {
      createdAt: Date;
      transactionGroupId: string;
      walletId: string;
    } | null = null;

    for (;;) {
      const chunk =
        await this.reportingRepository.fetchFeeRevenueExportChunk(
          range,
          cursor,
        );

      if (chunk.length === 0) {
        break;
      }

      appendCsvChunks(
        parts,
        REVENUE_CSV_HEADER,
        chunk.map(formatRevenueRow),
      );

      const last = chunk[chunk.length - 1]!;
      cursor = {
        createdAt: last.createdAt,
        transactionGroupId: last.transactionGroupId,
        walletId: last.walletId,
      };

      if (chunk.length < EXPORT_CHUNK_SIZE) {
        break;
      }
    }

    return parts.length > 0 ? parts.join('\n') : REVENUE_CSV_HEADER;
  }

  async exportReconciliationCsv(): Promise<string> {
    const header = 'walletId,projectionBalance,ledgerBalance,difference';
    const parts: string[] = [header];
    let offset = 0;

    for (;;) {
      const chunk =
        await this.reportingRepository.fetchReconciliationDriftChunk(offset);

      if (chunk.length === 0) {
        break;
      }

      parts.push(
        ...chunk.map(
          (d) =>
            `${d.walletId},${d.projectionBalance},${d.ledgerBalance},${d.difference}`,
        ),
      );

      offset += chunk.length;

      if (chunk.length < EXPORT_CHUNK_SIZE) {
        break;
      }
    }

    return parts.join('\n');
  }
}
