import { Injectable } from '@nestjs/common';
import {
  circuitBreakerOpenTotal,
  dlqEventsTotal,
  exportStreamBytesTotal,
  financialOperationTotal,
  idempotencyConflictTotal,
  idempotencyReplayTotal,
  metricsRegistry,
  outboxDispatchTotal,
  reconciliationDriftTotal,
} from './metrics.registry';

@Injectable()
export class MetricsService {
  async getMetrics(): Promise<string> {
    return metricsRegistry.metrics();
  }

  getContentType(): string {
    return metricsRegistry.contentType;
  }

  recordFinancialOperation(operation: string, status: 'success' | 'failure'): void {
    financialOperationTotal.inc({ operation, status });
  }

  recordIdempotencyReplay(scope: string): void {
    idempotencyReplayTotal.inc({ scope });
  }

  recordIdempotencyConflict(reason: string): void {
    idempotencyConflictTotal.inc({ reason });
  }

  recordReconciliationDrift(severity: string): void {
    if (severity !== 'NONE') {
      reconciliationDriftTotal.inc({ severity });
    }
  }

  recordCircuitOpen(scope: string): void {
    circuitBreakerOpenTotal.inc({ scope });
  }

  recordDlq(type: string): void {
    dlqEventsTotal.inc({ type });
  }

  recordExportBytes(exportName: string, bytes: number): void {
    exportStreamBytesTotal.inc({ export: exportName }, bytes);
  }

  recordOutboxDispatch(status: 'delivered' | 'retry' | 'dlq'): void {
    outboxDispatchTotal.inc({ status });
  }
}
