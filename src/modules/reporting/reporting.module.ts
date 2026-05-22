import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { ReportingController } from './controllers/reporting.controller';
import { SnapshotCron } from './jobs/snapshot.cron';
import { ReportingRepository } from './repositories/reporting.repository';
import { FinancialExportService } from './services/financial-export.service';
import { LedgerAnalyticsService } from './services/ledger-analytics.service';
import { PnlService } from './services/pnl.service';
import { SnapshotService } from './services/snapshot.service';

@Module({
  imports: [ReconciliationModule],
  controllers: [ReportingController],
  providers: [
    ReportingRepository,
    PnlService,
    LedgerAnalyticsService,
    SnapshotService,
    FinancialExportService,
    SnapshotCron,
  ],
  exports: [
    ReportingRepository,
    PnlService,
    LedgerAnalyticsService,
    SnapshotService,
  ],
})
export class ReportingModule {}
