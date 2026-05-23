import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaterializedViewsService } from '../services/materialized-views.service';

@Injectable()
export class MaterializedRefreshCron {
  private readonly logger = new Logger(MaterializedRefreshCron.name);

  constructor(
    private readonly materializedViewsService: MaterializedViewsService,
  ) {}

  @Cron('*/15 * * * *', { timeZone: 'UTC' })
  async refreshIncremental(): Promise<void> {
    try {
      await this.materializedViewsService.refreshTodayBuckets();
      this.logger.log({ event: 'materialized.cron_refresh_ok' });
    } catch (error) {
      this.logger.error({
        event: 'materialized.cron_refresh_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
