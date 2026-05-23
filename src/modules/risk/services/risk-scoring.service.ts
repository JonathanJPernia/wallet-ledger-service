import { Injectable, Logger } from '@nestjs/common';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { WalletRiskBlockedException } from '../../../common/errors/financial.exceptions';
import { AnomalyDetectionService } from '../../anomaly/services/anomaly-detection.service';
import {
  compositeRiskScore,
  riskLevelFromScore,
  shouldBlockOperation,
  type RiskLevel,
} from '../risk.policy';
import type { WalletRiskResponseDto } from '../dto/risk-response.dto';

@Injectable()
export class RiskScoringService {
  private readonly logger = new Logger(RiskScoringService.name);

  constructor(private readonly anomalyDetection: AnomalyDetectionService) {}

  async assessWallet(walletId: string): Promise<ApiResponseDto<WalletRiskResponseDto>> {
    const analysis = await this.anomalyDetection.analyzeWallet(walletId);
    const d = analysis.data;

    const score = compositeRiskScore({
      velocityScore: Number(d.walletVelocityScore),
      amountAnomalyScore: Number(d.amountZScore),
      graphScore: Number(d.graphCentralityScore),
    });

    const level = riskLevelFromScore(score);

    return buildApiResponse({
      walletId,
      riskScore: score.toFixed(2),
      riskLevel: level,
      flags: d.flags,
      velocityScore: d.walletVelocityScore,
      amountAnomalyScore: d.amountZScore,
      graphScore: d.graphCentralityScore,
    });
  }

  /**
   * Pre-flight guard for transfer/withdraw write path.
   */
  async assertWalletAllowed(
    walletId: string,
    operation: 'transfer' | 'withdraw',
  ): Promise<WalletRiskResponseDto> {
    const result = await this.assessWallet(walletId);
    const assessment = result.data;

    if (shouldBlockOperation(assessment.riskLevel as RiskLevel)) {
      this.logger.warn({
        event: 'risk.operation_blocked',
        walletId,
        operation,
        riskScore: assessment.riskScore,
        riskLevel: assessment.riskLevel,
        flags: assessment.flags,
      });
      throw new WalletRiskBlockedException(
        walletId,
        assessment.riskLevel,
        assessment.flags,
      );
    }

    if (assessment.riskLevel === 'FLAGGED') {
      this.logger.log({
        event: 'risk.operation_flagged',
        walletId,
        operation,
        riskScore: assessment.riskScore,
        flags: assessment.flags,
      });
    }

    return assessment;
  }
}
