import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LedgerPartitionService } from './ledger-partition.service';

@Injectable()
export class LedgerPartitionCron {
  private readonly logger = new Logger(LedgerPartitionCron.name);

  constructor(private readonly partitionService: LedgerPartitionService) {}

  /** Día 1 de cada mes 00:05 UTC — crea particiones futuras. */
  @Cron('5 0 1 * *', { timeZone: 'UTC' })
  async ensureMonthlyPartitions(): Promise<void> {
    try {
      await this.partitionService.ensurePartitions();
    } catch (error) {
      this.logger.error({
        event: 'ledger.partition_cron_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
