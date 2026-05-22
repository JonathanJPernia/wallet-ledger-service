import { Injectable, Logger } from '@nestjs/common';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { SNAPSHOT_CORRECTION_WINDOW_DAYS } from '../constants';
import { ReportingRepository } from '../repositories/reporting.repository';
import { decideSnapshotPersist } from '../utils/snapshot-policy';
import {
  previousUtcClosingDay,
  utcDayBounds,
} from '../utils/reporting-date.util';
import type { FinancialSnapshotDto } from '../dto/snapshot-response.dto';

export type SnapshotRunResult = FinancialSnapshotDto & {
  action: 'inserted' | 'skipped' | 'refreshed';
};

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(private readonly reportingRepository: ReportingRepository) {}

  /**
   * Cierre contable para [periodStart, periodEnd).
   * Fuera de ventana de corrección: insert-only (nunca overwrite).
   */
  async runDailySnapshot(
    forDate?: Date,
    currency = 'USD',
  ): Promise<SnapshotRunResult> {
    const closingDay = forDate ?? previousUtcClosingDay();
    const { start: periodStart, end: periodEnd } = utcDayBounds(closingDay);

    const existing = await this.reportingRepository.findFinancialSnapshot(
      closingDay,
      currency,
    );

    const decision = decideSnapshotPersist(closingDay, !!existing);

    if (decision.action === 'skip') {
      this.logger.log({
        event: 'reporting.snapshot_skipped_immutable',
        snapshotDate: closingDay.toISOString().slice(0, 10),
        currency,
      });
      return {
        ...this.toDto(existing!),
        action: 'skipped',
      };
    }

    const totals = await this.reportingRepository.computeSnapshotTotals(
      periodStart,
      periodEnd,
      currency.toUpperCase(),
    );

    const persistInput = {
      snapshotDate: closingDay,
      periodStart,
      periodEnd,
      currency: currency.toUpperCase(),
      totalSystemBalance: totals.totalSystemBalance,
      totalFeeRevenue: totals.totalFeeRevenue,
      totalVolume: totals.totalVolume,
    };

    const record =
      decision.action === 'refresh'
        ? await this.reportingRepository.replaceFinancialSnapshotInCorrectionWindow(
            persistInput,
          )
        : await this.reportingRepository.insertFinancialSnapshot(persistInput);

    this.logger.log({
      event: 'reporting.snapshot_stored',
      action: decision.action === 'refresh' ? 'refreshed' : 'inserted',
      snapshotDate: closingDay.toISOString().slice(0, 10),
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      currency,
      totalSystemBalance: totals.totalSystemBalance.toString(),
      totalFeeRevenue: totals.totalFeeRevenue.toString(),
      totalVolume: totals.totalVolume.toString(),
    });

    return {
      ...this.toDto(record),
      action: decision.action === 'refresh' ? 'refreshed' : 'inserted',
    };
  }

  /**
   * Cron: re-procesa últimos N días UTC (late-arriving) + todas las monedas del ledger.
   */
  async runClosingCycle(
    correctionWindowDays = SNAPSHOT_CORRECTION_WINDOW_DAYS,
  ): Promise<void> {
    const currencies = await this.reportingRepository.listDistinctLedgerCurrencies();
    const activeCurrencies = currencies.length > 0 ? currencies : ['USD'];

    const base = previousUtcClosingDay();

    for (let offset = 0; offset < correctionWindowDays; offset++) {
      const day = new Date(
        Date.UTC(
          base.getUTCFullYear(),
          base.getUTCMonth(),
          base.getUTCDate() - offset,
        ),
      );

      for (const currency of activeCurrencies) {
        await this.runDailySnapshot(day, currency);
      }
    }
  }

  async listSnapshots(input: {
    from?: string;
    to?: string;
    currency?: string;
  }): Promise<ApiResponseDto<FinancialSnapshotDto[]>> {
    const from = input.from ? new Date(input.from) : undefined;
    const to = input.to ? new Date(input.to) : undefined;

    const rows = await this.reportingRepository.listSnapshots(
      from,
      to,
      input.currency,
    );

    return buildApiResponse(rows.map((r) => this.toDto(r)));
  }

  async triggerManualSnapshot(
    date?: string,
    currency?: string,
  ): Promise<ApiResponseDto<SnapshotRunResult>> {
    const forDate = date ? new Date(date) : previousUtcClosingDay();
    const snapshot = await this.runDailySnapshot(forDate, currency ?? 'USD');
    return buildApiResponse(snapshot);
  }

  /** Valida snapshot vs ledger para el mismo periodo congelado. */
  async verifySnapshotAgainstLedger(
    snapshotDate: string,
    currency = 'USD',
  ): Promise<{ matches: boolean; snapshotFee: string; ledgerFee: string }> {
    const day = new Date(snapshotDate);
    const { start, end } = utcDayBounds(day);
    const snapshot = await this.reportingRepository.findFinancialSnapshot(
      day,
      currency,
    );
    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    const ledgerFee = await this.reportingRepository.sumFeeRevenue({
      startDate: start,
      endDate: end,
      currency,
    });

    const snapshotFee = snapshot.totalFeeRevenue.toFixed(2);
    const ledgerFeeStr = ledgerFee.toFixed(2);

    return {
      matches: snapshotFee === ledgerFeeStr,
      snapshotFee,
      ledgerFee: ledgerFeeStr,
    };
  }

  private toDto(record: {
    id: string;
    snapshotDate: Date;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    totalSystemBalance: { toFixed(n: number): string };
    totalFeeRevenue: { toFixed(n: number): string };
    totalVolume: { toFixed(n: number): string };
    createdAt: Date;
  }): FinancialSnapshotDto {
    return {
      id: record.id,
      date: record.snapshotDate.toISOString().slice(0, 10),
      periodStart: record.periodStart.toISOString(),
      periodEnd: record.periodEnd.toISOString(),
      currency: record.currency,
      totalSystemBalance: record.totalSystemBalance.toFixed(2),
      totalFeeRevenue: record.totalFeeRevenue.toFixed(2),
      totalVolume: record.totalVolume.toFixed(2),
      createdAt: record.createdAt.toISOString(),
    };
  }
}
