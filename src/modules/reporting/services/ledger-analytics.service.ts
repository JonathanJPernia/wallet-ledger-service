import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { ReportingRepository } from '../repositories/reporting.repository';
import { resolveReportingRange } from '../utils/reporting-date.util';
import type {
  RebuildWalletResponseDto,
  SystemAnalyticsResponseDto,
  TopWalletVolumeDto,
  WalletAnalyticsResponseDto,
} from '../dto/analytics-response.dto';
import type { ReportingPeriod } from '../reporting.types';

@Injectable()
export class LedgerAnalyticsService {
  private readonly logger = new Logger(LedgerAnalyticsService.name);

  constructor(private readonly reportingRepository: ReportingRepository) {}

  async getWalletAnalytics(
    walletId: string,
    input: {
      period?: ReportingPeriod;
      startDate?: string;
      endDate?: string;
      currency?: string;
    },
  ): Promise<ApiResponseDto<WalletAnalyticsResponseDto>> {
    const wallet = await this.reportingRepository.findWalletProjection(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    const { startDate, endDate } = resolveReportingRange(
      input.period ?? 'daily',
      input.startDate,
      input.endDate,
    );

    const activity = await this.reportingRepository.getWalletActivity(walletId, {
      startDate,
      endDate,
      currency: input.currency ?? wallet.currency,
    });

    const netFlow = activity.totalDeposits
      .add(activity.totalTransferIn)
      .sub(activity.totalWithdrawals)
      .sub(activity.totalTransferOut)
      .sub(activity.totalFeesOut);

    return buildApiResponse({
      walletId,
      currency: wallet.currency,
      period: input.period ?? 'custom',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalDeposits: activity.totalDeposits.toFixed(2),
      totalWithdrawals: activity.totalWithdrawals.toFixed(2),
      totalTransferIn: activity.totalTransferIn.toFixed(2),
      totalTransferOut: activity.totalTransferOut.toFixed(2),
      totalFeesOut: activity.totalFeesOut.toFixed(2),
      netFlow: netFlow.toFixed(2),
    });
  }

  async getSystemAnalytics(input: {
    period?: ReportingPeriod;
    startDate?: string;
    endDate?: string;
    currency?: string;
  }): Promise<ApiResponseDto<SystemAnalyticsResponseDto>> {
    const { startDate, endDate } = resolveReportingRange(
      input.period ?? 'daily',
      input.startDate,
      input.endDate,
    );

    const range = {
      startDate,
      endDate,
      currency: input.currency ?? 'USD',
    };

    const [activity, topWallets] = await Promise.all([
      this.reportingRepository.getSystemActivity(range),
      this.reportingRepository.getTopWalletsByVolume(range, 10),
    ]);

    const top: TopWalletVolumeDto[] = topWallets.map((row) => ({
      walletId: row.walletId,
      volume: new Prisma.Decimal(row.volume).toFixed(2),
      entryCount: Number(row.entryCount),
    }));

    return buildApiResponse({
      period: input.period ?? 'custom',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currency: range.currency,
      totalTransfers: Number(activity.transferCount),
      transferVolume: activity.transferVolume.toFixed(2),
      totalWithdrawals: Number(activity.withdrawCount),
      withdrawVolume: activity.withdrawVolume.toFixed(2),
      totalDeposits: Number(activity.depositCount),
      depositVolume: activity.depositVolume.toFixed(2),
      totalFeesCollected: activity.totalFeesCollected.toFixed(2),
      topWalletsByVolume: top,
    });
  }

  /**
   * Replay ledger hasta toDate y comparar con proyección (forensic / compliance).
   * Reporting confía en ledger; la proyección es referencia operativa.
   */
  async rebuildWallet(
    walletId: string,
    toDate: string,
  ): Promise<ApiResponseDto<RebuildWalletResponseDto>> {
    const wallet = await this.reportingRepository.findWalletProjection(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    const asOf = new Date(toDate);
    if (Number.isNaN(asOf.getTime())) {
      throw new Error('Invalid toDate');
    }

    const ledgerBalance =
      await this.reportingRepository.computeLedgerBalanceAsOf(walletId, asOf);

    const projectionBalance = wallet.currentBalance;
    const difference = projectionBalance.sub(ledgerBalance);
    const isConsistent = difference.eq(0);

    this.logger.log({
      event: 'reporting.wallet_rebuilt',
      walletId,
      toDate: asOf.toISOString(),
      ledgerBalance: ledgerBalance.toFixed(2),
      projectionBalance: projectionBalance.toFixed(2),
      isConsistent,
    });

    return buildApiResponse({
      walletId,
      toDate: asOf.toISOString(),
      ledgerBalance: ledgerBalance.toFixed(2),
      projectionBalance: projectionBalance.toFixed(2),
      difference: difference.toFixed(2),
      isConsistent,
      sourceOfTruth: 'ledger',
    });
  }
}
