import { Injectable, Logger } from '@nestjs/common';
import { utcDayBounds } from '../../reporting/utils/reporting-date.util';
import { MaterializedViewsRepository } from '../repositories/materialized-views.repository';

@Injectable()
export class MaterializedViewsService {
  private readonly logger = new Logger(MaterializedViewsService.name);

  constructor(
    private readonly materializedRepository: MaterializedViewsRepository,
  ) {}

  /** Incremental refresh del bucket UTC actual (re-ejecutable). */
  async refreshTodayBuckets(): Promise<void> {
    const now = new Date();
    const { start, end } = utcDayBounds(now);

    await Promise.all([
      this.materializedRepository.refreshDailyWalletBalances(now, start, end),
      this.materializedRepository.refreshDailyFeeRevenue(now, start, end),
      this.materializedRepository.refreshDailySystemVolume(now, start, end),
    ]);

    this.logger.log({
      event: 'materialized.refresh_today',
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
    });
  }
}
