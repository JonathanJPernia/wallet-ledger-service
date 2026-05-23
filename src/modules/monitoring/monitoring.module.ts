import { Module } from '@nestjs/common';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { EventsModule } from '../events/events.module';
import { MonitoringController } from './controllers/monitoring.controller';
import { FinancialMonitoringService } from './services/financial-monitoring.service';

@Module({
  imports: [EventsModule, AnomalyModule],
  controllers: [MonitoringController],
  providers: [FinancialMonitoringService],
})
export class MonitoringModule {}
