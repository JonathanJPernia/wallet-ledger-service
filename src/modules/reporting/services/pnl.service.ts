import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { ReportingRepository } from '../repositories/reporting.repository';
import type { ReportingPeriod } from '../reporting.types';
import { resolveReportingRange } from '../utils/reporting-date.util';
import type { PnlResponseDto } from '../dto/pnl-response.dto';

@Injectable()
export class PnlService {
  private readonly logger = new Logger(PnlService.name);

  constructor(private readonly reportingRepository: ReportingRepository) {}

  async getPnl(input: {
    period: ReportingPeriod;
    startDate?: string;
    endDate?: string;
    currency?: string;
  }): Promise<ApiResponseDto<PnlResponseDto>> {
    const { startDate, endDate } = resolveReportingRange(
      input.period,
      input.startDate,
      input.endDate,
    );

    const range = {
      startDate,
      endDate,
      currency: input.currency ?? 'USD',
    };

    const [totalRevenue, breakdownRows] = await Promise.all([
      this.reportingRepository.sumFeeRevenue(range),
      this.reportingRepository.feeBreakdownByGroupType(range),
    ]);

    const feeBreakdown = {
      TRANSFER: '0.00',
      WITHDRAW: '0.00',
      DEPOSIT: '0.00',
    };

    for (const row of breakdownRows) {
      if (row.sourceType === 'TRANSFER') {
        feeBreakdown.TRANSFER = new Prisma.Decimal(row.revenue).toFixed(2);
      } else if (row.sourceType === 'WITHDRAW') {
        feeBreakdown.WITHDRAW = new Prisma.Decimal(row.revenue).toFixed(2);
      } else if (row.sourceType === 'DEPOSIT') {
        feeBreakdown.DEPOSIT = new Prisma.Decimal(row.revenue).toFixed(2);
      }
    }

    const totalRevenueStr = totalRevenue.toFixed(2);

    this.logger.log({
      event: 'reporting.pnl_computed',
      period: input.period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalRevenue: totalRevenueStr,
    });

    return buildApiResponse({
      period: input.period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currency: range.currency,
      totalRevenue: totalRevenueStr,
      feeBreakdown,
      netProfit: totalRevenueStr,
    });
  }
}
