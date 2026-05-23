import { Module } from '@nestjs/common';
import { AnomalyController } from './controllers/anomaly.controller';
import { AnomalyRepository } from './repositories/anomaly.repository';
import { AnomalyDetectionService } from './services/anomaly-detection.service';

@Module({
  controllers: [AnomalyController],
  providers: [AnomalyRepository, AnomalyDetectionService],
  exports: [AnomalyDetectionService, AnomalyRepository],
})
export class AnomalyModule {}
