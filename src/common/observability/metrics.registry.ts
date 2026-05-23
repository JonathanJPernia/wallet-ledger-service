import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const financialOperationTotal = new Counter({
  name: 'financial_operation_total',
  help: 'Financial write operations',
  labelNames: ['operation', 'status'] as const,
  registers: [metricsRegistry],
});

export const idempotencyReplayTotal = new Counter({
  name: 'idempotency_replay_total',
  help: 'Idempotency fast-path replays',
  labelNames: ['scope'] as const,
  registers: [metricsRegistry],
});

export const idempotencyConflictTotal = new Counter({
  name: 'idempotency_conflict_total',
  help: 'Idempotency conflicts (in-flight or hash mismatch)',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});

export const reconciliationDriftTotal = new Counter({
  name: 'reconciliation_drift_total',
  help: 'Reconciliation drifts by severity',
  labelNames: ['severity'] as const,
  registers: [metricsRegistry],
});

export const circuitBreakerOpenTotal = new Counter({
  name: 'circuit_breaker_open_total',
  help: 'Circuit breaker opened events',
  labelNames: ['scope'] as const,
  registers: [metricsRegistry],
});

export const dlqEventsTotal = new Counter({
  name: 'dlq_events_total',
  help: 'Events moved to dead letter queue',
  labelNames: ['type'] as const,
  registers: [metricsRegistry],
});

export const exportStreamBytesTotal = new Counter({
  name: 'export_stream_bytes_total',
  help: 'Bytes written in CSV export streams',
  labelNames: ['export'] as const,
  registers: [metricsRegistry],
});

export const outboxDispatchTotal = new Counter({
  name: 'outbox_dispatch_total',
  help: 'Outbox dispatch outcomes',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});
