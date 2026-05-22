import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SnapshotService } from '../services/snapshot.service';

@Injectable()
export class SnapshotCron {
  private readonly logger = new Logger(SnapshotCron.name);

  constructor(private readonly snapshotService: SnapshotService) {}

  /**
   * 00:00 UTC: cierra ayer + refresca ventana de corrección (late-arriving).
   * Snapshots antiguos fuera de ventana nunca se sobrescriben.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async handleDailyClosing(): Promise<void> {
    try {
      await this.snapshotService.runClosingCycle();
      this.logger.log({ event: 'reporting.cron_daily_snapshot_ok' });
    } catch (error) {
      this.logger.error({
        event: 'reporting.cron_daily_snapshot_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
