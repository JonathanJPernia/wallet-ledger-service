import { Injectable, Logger } from '@nestjs/common';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { AnomalyRepository } from '../repositories/anomaly.repository';
import {
  scoreAmount,
  scoreGraph,
  scoreVelocity,
} from '../anomaly.scoring';
import { AnomalyFlag } from '../anomaly.flags';
import type { WalletAnomalyResponseDto } from '../dto/anomaly-response.dto';

const WINDOW_MS = 60 * 60 * 1000;
const FEE_SPIKE_THRESHOLD = 10_000;

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(private readonly anomalyRepository: AnomalyRepository) {}

  async analyzeWallet(
    walletId: string,
  ): Promise<ApiResponseDto<WalletAnomalyResponseDto>> {
    const since = new Date(Date.now() - WINDOW_MS);
    const [velocity, amounts, circularPairs, selfLoops] = await Promise.all([
      this.anomalyRepository.getWalletVelocity(walletId, since),
      this.anomalyRepository.getWalletAmountStats(walletId, since),
      this.anomalyRepository.countCircularTransfers(walletId, since),
      this.anomalyRepository.countSelfTransferLoops(walletId, since),
    ]);

    const velocityResult = scoreVelocity(velocity);
    const isRound =
      amounts.lastAmount > 0 && amounts.lastAmount % 1000 === 0;
    const amountResult = scoreAmount(amounts, isRound);
    const graphResult = scoreGraph({ circularPairs, selfLoops });

    const walletVelocityScore = velocityResult.score;
    const transactionVelocityScore = Math.max(
      velocity.deposits1h / 10,
      velocity.withdraws1h / 8,
      velocity.transfersOut1h / 15,
      0,
    );
    const amountZScore = amountResult.score;
    const graphCentralityScore = graphResult.score;

    const flags = [
      ...new Set([
        ...velocityResult.flags,
        ...amountResult.flags,
        ...graphResult.flags,
      ]),
    ];

    const riskScore = clamp01(
      walletVelocityScore * 0.25 +
        Math.min(1, transactionVelocityScore) * 0.25 +
        amountZScore * 0.25 +
        graphCentralityScore * 0.25,
    );

    this.logger.log({
      event: 'anomaly.wallet_analyzed',
      walletId,
      riskScore,
      flags,
    });

    return buildApiResponse({
      walletId,
      riskScore: riskScore.toFixed(2),
      walletVelocityScore: walletVelocityScore.toFixed(2),
      transactionVelocityScore: Math.min(1, transactionVelocityScore).toFixed(2),
      amountZScore: amountZScore.toFixed(2),
      graphCentralityScore: graphCentralityScore.toFixed(2),
      flags,
      windowStart: since.toISOString(),
      windowEnd: new Date().toISOString(),
    });
  }

  async scanSystem(currency = 'USD') {
    const since = new Date(Date.now() - WINDOW_MS);
    const feeInflow =
      await this.anomalyRepository.getFeeWalletInflow1h(since, currency);

    const flags: string[] = [];
    if (feeInflow.gte(FEE_SPIKE_THRESHOLD)) {
      flags.push(AnomalyFlag.FEE_WALLET_INFLOW_SPIKE);
    }

    return buildApiResponse({
      currency,
      feeInflow1h: feeInflow.toFixed(2),
      flags,
      windowStart: since.toISOString(),
    });
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number(n.toFixed(4))));
}
