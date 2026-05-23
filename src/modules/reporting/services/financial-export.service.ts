import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { readableFromCsvGenerator } from '../../../common/streaming/csv-stream.util';
import { MetricsService } from '../../../common/observability/metrics.service';
import { EXPORT_CHUNK_SIZE } from '../constants';
import { ReconciliationRepository } from '../../reconciliation/repositories/reconciliation.repository';
import { ReportingRepository } from '../repositories/reporting.repository';
import { resolveReportingRange } from '../utils/reporting-date.util';
import {
  formatRevenueRow,
  formatWalletLedgerRow,
  REVENUE_CSV_HEADER,
  WALLET_LEDGER_CSV_HEADER,
} from '../utils/export-csv.util';
import type { ReportingPeriod } from '../reporting.types';

@Injectable()
export class FinancialExportService {
  constructor(
    private readonly reportingRepository: ReportingRepository,
    private readonly reconciliationRepository: ReconciliationRepository,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * HTTP streaming real: un chunk de filas por iteración, sin join global.
   */
  streamWalletLedgerCsv(
    walletId: string,
    input?: { startDate?: string; endDate?: string },
  ): Readable {
    const range =
      input?.startDate && input?.endDate
        ? {
            startDate: new Date(input.startDate),
            endDate: new Date(input.endDate),
          }
        : undefined;

    const generator = this.walletLedgerGenerator(walletId, range);
    return this.wrapStream('wallet_ledger', generator);
  }

  streamRevenueCsv(input: {
    period?: ReportingPeriod;
    startDate?: string;
    endDate?: string;
    currency?: string;
  }): Readable {
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
    return this.wrapStream('revenue', this.revenueGenerator(range));
  }

  streamReconciliationCsv(): Readable {
    return this.wrapStream(
      'reconciliation',
      this.reconciliationGenerator(),
    );
  }

  private wrapStream(
    name: string,
    generator: AsyncGenerator<string, void, unknown>,
  ): Readable {
    const stream = readableFromCsvGenerator(generator);
    stream.on('data', (chunk: Buffer | string) => {
      const bytes =
        typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      this.metrics.recordExportBytes(name, bytes);
    });
    return stream;
  }

  private async *walletLedgerGenerator(
    walletId: string,
    range?: { startDate: Date; endDate: Date },
  ): AsyncGenerator<string, void, unknown> {
    yield `${WALLET_LEDGER_CSV_HEADER}\n`;
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
      for (const row of chunk) {
        yield `${formatWalletLedgerRow(row)}\n`;
      }
      const last = chunk[chunk.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (chunk.length < EXPORT_CHUNK_SIZE) {
        break;
      }
    }

  }

  private async *revenueGenerator(range: {
    startDate: Date;
    endDate: Date;
    currency: string;
  }): AsyncGenerator<string, void, unknown> {
    yield `${REVENUE_CSV_HEADER}\n`;
    let cursor: {
      createdAt: Date;
      transactionGroupId: string;
      walletId: string;
    } | null = null;

    for (;;) {
      const chunk =
        await this.reportingRepository.fetchFeeRevenueExportChunk(range, cursor);
      if (chunk.length === 0) {
        break;
      }
      for (const row of chunk) {
        yield `${formatRevenueRow(row)}\n`;
      }
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
  }

  private async *reconciliationGenerator(): AsyncGenerator<string, void, unknown> {
    const header = 'walletId,projectionBalance,ledgerBalance,difference,severity,dataSource\n';
    yield header;
    let offset = 0;

    for (;;) {
      const chunk =
        await this.reconciliationRepository.fetchReconciliationDriftChunkV2(
          offset,
        );
      if (chunk.length === 0) {
        break;
      }
      for (const d of chunk) {
        yield `${d.walletId},${d.projectionBalance},${d.ledgerBalance},${d.difference},${d.severity},${d.dataSource}\n`;
      }
      offset += chunk.length;
      if (chunk.length < EXPORT_CHUNK_SIZE) {
        break;
      }
    }
  }
}
