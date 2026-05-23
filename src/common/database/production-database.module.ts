import { Global, Module } from '@nestjs/common';
import { LedgerPartitionCron } from './ledger-partition.cron';
import { LedgerPartitionService } from './ledger-partition.service';

@Global()
@Module({
  providers: [LedgerPartitionService, LedgerPartitionCron],
  exports: [LedgerPartitionService],
})
export class ProductionDatabaseModule {}
