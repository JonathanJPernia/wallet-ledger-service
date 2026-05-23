import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../../common/observability/metrics.service';
import { AuditLogService } from '../../../common/observability/audit-log.service';
import { OutboxRepository } from '../repositories/outbox.repository';

@Injectable()
export class OutboxDispatchService {
  private readonly logger = new Logger(OutboxDispatchService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly metrics: MetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async dispatchPending(): Promise<{ delivered: number; retried: number; dlq: number }> {
    const batch = await this.outboxRepository.claimPendingBatch();
    let delivered = 0;
    let retried = 0;
    let dlq = 0;

    for (const row of batch) {
      try {
        await this.outboxRepository.deliverToFinancialEvents(row);
        await this.outboxRepository.markDelivered(row.id);
        delivered++;
        this.metrics.recordOutboxDispatch('delivered');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const before = row.attempts;
        await this.outboxRepository.markRetry(
          row.id,
          before,
          row.maxAttempts,
          message,
        );

        if (before + 1 >= row.maxAttempts) {
          dlq++;
          this.metrics.recordOutboxDispatch('dlq');
          this.metrics.recordDlq(row.type);
          await this.auditLog.record({
            action: 'events.dlq',
            entityType: 'financial_event_outbox',
            entityId: row.id,
            correlationId: row.correlationId ?? undefined,
            metadata: { type: row.type, error: message },
          });
          this.logger.error({
            event: 'events.dlq',
            outboxId: row.id,
            type: row.type,
            error: message,
            correlationId: row.correlationId,
          });
        } else {
          retried++;
          this.metrics.recordOutboxDispatch('retry');
          this.logger.warn({
            event: 'events.outbox_retry',
            outboxId: row.id,
            attempts: before + 1,
            error: message,
          });
        }
      }
    }

    return { delivered, retried, dlq };
  }
}
