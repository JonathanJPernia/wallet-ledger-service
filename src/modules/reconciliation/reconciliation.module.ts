import { Module } from '@nestjs/common';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { ReconciliationService } from './services/reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationRepository, ReconciliationService],
  exports: [
    ReconciliationService,
    ReconciliationRepository,
  ],
})
export class ReconciliationModule {}
