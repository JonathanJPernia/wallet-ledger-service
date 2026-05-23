export type RiskLevel = 'NORMAL' | 'FLAGGED' | 'LIMITED' | 'BLOCKED';

export const RISK_WEIGHTS = {
  velocity: 0.35,
  amount: 0.35,
  graph: 0.3,
} as const;

export function compositeRiskScore(scores: {
  velocityScore: number;
  amountAnomalyScore: number;
  graphScore: number;
}): number {
  return clamp01(
    scores.velocityScore * RISK_WEIGHTS.velocity +
      scores.amountAnomalyScore * RISK_WEIGHTS.amount +
      scores.graphScore * RISK_WEIGHTS.graph,
  );
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 0.9) {
    return 'BLOCKED';
  }
  if (score >= 0.75) {
    return 'LIMITED';
  }
  if (score >= 0.5) {
    return 'FLAGGED';
  }
  return 'NORMAL';
}

export function shouldBlockOperation(level: RiskLevel): boolean {
  return level === 'BLOCKED' || level === 'LIMITED';
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
