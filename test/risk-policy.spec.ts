import {
  compositeRiskScore,
  riskLevelFromScore,
  shouldBlockOperation,
} from '../src/modules/risk/risk.policy';

describe('risk.policy', () => {
  it('computes weighted composite score', () => {
    const score = compositeRiskScore({
      velocityScore: 0.8,
      amountAnomalyScore: 0.6,
      graphScore: 0.4,
    });
    expect(score).toBeCloseTo(0.61, 2);
  });

  it('maps score to risk levels', () => {
    expect(riskLevelFromScore(0.2)).toBe('NORMAL');
    expect(riskLevelFromScore(0.6)).toBe('FLAGGED');
    expect(riskLevelFromScore(0.8)).toBe('LIMITED');
    expect(riskLevelFromScore(0.95)).toBe('BLOCKED');
  });

  it('blocks LIMITED and BLOCKED', () => {
    expect(shouldBlockOperation('NORMAL')).toBe(false);
    expect(shouldBlockOperation('FLAGGED')).toBe(false);
    expect(shouldBlockOperation('LIMITED')).toBe(true);
    expect(shouldBlockOperation('BLOCKED')).toBe(true);
  });
});
