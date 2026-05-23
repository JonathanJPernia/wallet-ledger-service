import { Module } from '@nestjs/common';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { RiskController } from './controllers/risk.controller';
import { RiskScoringService } from './services/risk-scoring.service';

@Module({
  imports: [AnomalyModule],
  controllers: [RiskController],
  providers: [RiskScoringService],
  exports: [RiskScoringService],
})
export class RiskModule {}
