import {
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_OPEN_COOLDOWN_MS,
} from '../src/modules/circuit-breaker/circuit-breaker.policy';

describe('circuit-breaker.policy', () => {
  it('opens after 5 failures in 60s window', () => {
    expect(CIRCUIT_FAILURE_THRESHOLD).toBe(5);
  });

  it('cooldown before half-open is 30s', () => {
    expect(CIRCUIT_OPEN_COOLDOWN_MS).toBe(30_000);
  });
});
