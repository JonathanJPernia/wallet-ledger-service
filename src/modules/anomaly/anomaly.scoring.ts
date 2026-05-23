import { AnomalyFlag, type AnomalyFlagCode } from './anomaly.flags';

export type VelocityMetrics = {
  deposits1h: number;
  withdraws1h: number;
  transfersOut1h: number;
};

export type AmountMetrics = {
  lastAmount: number;
  avgAmount: number;
  maxAmount: number;
};

export type GraphMetrics = {
  circularPairs: number;
  selfLoops: number;
};

export function scoreVelocity(metrics: VelocityMetrics): {
  score: number;
  flags: AnomalyFlagCode[];
} {
  const flags: AnomalyFlagCode[] = [];
  let score = 0;

  if (metrics.deposits1h >= 10) {
    flags.push(AnomalyFlag.HIGH_DEPOSIT_RATE);
    score = Math.max(score, 0.7);
  }
  if (metrics.withdraws1h >= 8) {
    flags.push(AnomalyFlag.HIGH_WITHDRAW_RATE);
    score = Math.max(score, 0.85);
  }
  if (metrics.transfersOut1h >= 15) {
    flags.push(AnomalyFlag.HIGH_TRANSFER_RATE);
    score = Math.max(score, 0.75);
  }

  return { score: clamp01(score), flags };
}

export function scoreAmount(
  metrics: AmountMetrics,
  isRoundAmount: boolean,
): { score: number; flags: AnomalyFlagCode[] } {
  const flags: AnomalyFlagCode[] = [];
  let score = 0;

  if (metrics.avgAmount > 0 && metrics.lastAmount >= metrics.avgAmount * 3) {
    flags.push(AnomalyFlag.UNUSUAL_AMOUNT);
    score = Math.max(score, 0.8);
  }

  if (isRoundAmount && metrics.lastAmount >= 1000) {
    flags.push(AnomalyFlag.ROUND_AMOUNT_PATTERN);
    score = Math.max(score, 0.55);
  }

  return { score: clamp01(score), flags };
}

export function scoreGraph(metrics: GraphMetrics): {
  score: number;
  flags: AnomalyFlagCode[];
} {
  const flags: AnomalyFlagCode[] = [];
  let score = 0;

  if (metrics.circularPairs > 0) {
    flags.push(AnomalyFlag.UNUSUAL_TRANSFER_CYCLE);
    score = Math.max(score, 0.9);
  }
  if (metrics.selfLoops > 0) {
    flags.push(AnomalyFlag.SELF_TRANSFER_LOOP);
    score = Math.max(score, 0.95);
  }

  return { score: clamp01(score), flags };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
