import { Injectable } from '@nestjs/common';
import { FinancialEventType, Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { AnomalyDetectionService } from '../../anomaly/services/anomaly-detection.service';
import { EventsRepository } from '../../events/repositories/events.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { LiveMonitoringResponseDto } from '../dto/monitoring-response.dto';

@Injectable()
export class FinancialMonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsRepository: EventsRepository,
    private readonly anomalyDetection: AnomalyDetectionService,
  ) {}

  async getLiveMetrics(
    currency = 'USD',
  ): Promise<ApiResponseDto<LiveMonitoringResponseDto>> {
    const since1m = new Date(Date.now() - 60_000);
    const since1h = new Date(Date.now() - 60 * 60 * 1000);

    const [feesPerMinute, activeWallets, transferEvents1h, systemScan] =
      await Promise.all([
        this.sumFeeInflow(since1m, currency),
        this.countActiveWallets(since1h),
        this.eventsRepository.countSince(
          since1h,
          FinancialEventType.TRANSFER_COMPLETED,
        ),
        this.anomalyDetection.scanSystem(currency),
      ]);

    return buildApiResponse({
      currency,
      systemFeesPerMinute: feesPerMinute.toFixed(2),
      systemFeesPerHour: (await this.sumFeeInflow(since1h, currency)).toFixed(2),
      activeWallets1h: activeWallets,
      transferEvents1h,
      suspiciousEvents: systemScan.data.flags.length,
      anomalyFlags: systemScan.data.flags,
      observedAt: new Date().toISOString(),
    });
  }

  private async sumFeeInflow(since: Date, currency: string) {
    const rows = await this.prisma.$queryRaw<{ total: Prisma.Decimal }[]>`
      SELECT COALESCE(SUM(amount), 0)::decimal(18, 2) AS total
      FROM ledger_entries
      WHERE "operationType" = 'FEE_IN'::"OperationType"
        AND "createdAt" >= ${since}
        AND currency = ${currency}
    `;
    return new Prisma.Decimal(rows[0]?.total ?? 0);
  }

  private async countActiveWallets(since: Date) {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT "walletId")::bigint AS count
      FROM ledger_entries
      WHERE "createdAt" >= ${since}
    `;
    return Number(rows[0]?.count ?? 0);
  }
}
