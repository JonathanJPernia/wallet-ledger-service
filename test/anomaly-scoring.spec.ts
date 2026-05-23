import { AnomalyFlag } from '../src/modules/anomaly/anomaly.flags';
import {
  scoreAmount,
  scoreGraph,
  scoreVelocity,
} from '../src/modules/anomaly/anomaly.scoring';

describe('anomaly.scoring', () => {
  it('flags high withdraw velocity', () => {
    const result = scoreVelocity({
      deposits1h: 0,
      withdraws1h: 10,
      transfersOut1h: 0,
    });
    expect(result.flags).toContain(AnomalyFlag.HIGH_WITHDRAW_RATE);
    expect(result.score).toBeGreaterThanOrEqual(0.85);
  });

  it('flags unusual amount vs average', () => {
    const result = scoreAmount(
      { lastAmount: 3000, avgAmount: 500, maxAmount: 3000 },
      false,
    );
    expect(result.flags).toContain(AnomalyFlag.UNUSUAL_AMOUNT);
  });

  it('flags transfer cycles', () => {
    const result = scoreGraph({ circularPairs: 1, selfLoops: 0 });
    expect(result.flags).toContain(AnomalyFlag.UNUSUAL_TRANSFER_CYCLE);
    expect(result.score).toBeGreaterThanOrEqual(0.9);
  });
});
