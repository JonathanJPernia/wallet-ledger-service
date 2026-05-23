import { Injectable, Logger } from '@nestjs/common';
import { CircuitState } from '@prisma/client';
import { MetricsService } from '../../common/observability/metrics.service';
import { AuditLogService } from '../../common/observability/audit-log.service';
import { WalletCircuitOpenException } from '../../common/errors/financial.exceptions';
import {
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_FAILURE_WINDOW_MS,
  CIRCUIT_HALF_OPEN_SUCCESS_THRESHOLD,
  CIRCUIT_OPEN_COOLDOWN_MS,
} from './circuit-breaker.policy';
import {
  CircuitBreakerRepository,
  type CircuitScope,
} from './circuit-breaker.repository';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  constructor(
    private readonly repository: CircuitBreakerRepository,
    private readonly metrics: MetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async assertWalletOperational(
    walletId: string,
    operation: string,
    correlationId?: string,
  ): Promise<void> {
    await this.assertOperational('wallet', walletId, operation, correlationId);
  }

  async assertOperational(
    scope: CircuitScope,
    targetId: string,
    operation: string,
    correlationId?: string,
  ): Promise<void> {
    const row = await this.repository.find(scope, targetId);
    if (!row) {
      return;
    }

    const now = new Date();

    if (row.state === CircuitState.OPEN) {
      if (row.nextAttemptAt && row.nextAttemptAt > now) {
        throw new WalletCircuitOpenException(targetId, row.state);
      }
      await this.repository.updateState(scope, targetId, {
        state: CircuitState.HALF_OPEN,
        successCount: 0,
      });
      this.logger.log({
        event: 'circuit.half_open',
        scope,
        targetId,
        operation,
        correlationId,
      });
      return;
    }

    if (row.state === CircuitState.HALF_OPEN) {
      return;
    }
  }

  async recordSuccess(
    scope: CircuitScope,
    targetId: string,
    correlationId?: string,
  ): Promise<void> {
    const row = await this.repository.find(scope, targetId);
    if (!row) {
      return;
    }

    if (row.state === CircuitState.HALF_OPEN) {
      const successCount = row.successCount + 1;
      if (successCount >= CIRCUIT_HALF_OPEN_SUCCESS_THRESHOLD) {
        await this.repository.updateState(scope, targetId, {
          state: CircuitState.CLOSED,
          failureCount: 0,
          successCount: 0,
          openedAt: null,
          nextAttemptAt: null,
        });
        if (scope === 'wallet') {
          await this.repository.unfreezeWallet(targetId);
        }
        await this.auditLog.record({
          action: 'circuit.closed',
          entityType: scope,
          entityId: targetId,
          correlationId,
        });
        this.logger.log({
          event: 'circuit.closed',
          scope,
          targetId,
          correlationId,
        });
      } else {
        await this.repository.updateState(scope, targetId, {
          state: CircuitState.HALF_OPEN,
          successCount,
        });
      }
      return;
    }

    if (row.failureCount > 0) {
      await this.repository.updateState(scope, targetId, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
      });
    }
  }

  async recordFailure(
    scope: CircuitScope,
    targetId: string,
    correlationId?: string,
  ): Promise<void> {
    const now = new Date();
    const row = await this.repository.find(scope, targetId);

    let failureCount = 1;
    if (
      row &&
      row.lastFailureAt &&
      now.getTime() - row.lastFailureAt.getTime() <= CIRCUIT_FAILURE_WINDOW_MS
    ) {
      failureCount = row.failureCount + 1;
    }

    const shouldOpen = failureCount >= CIRCUIT_FAILURE_THRESHOLD;
    const state = shouldOpen ? CircuitState.OPEN : (row?.state ?? CircuitState.CLOSED);
    const nextAttemptAt = shouldOpen
      ? new Date(now.getTime() + CIRCUIT_OPEN_COOLDOWN_MS)
      : row?.nextAttemptAt ?? null;

    await this.repository.upsertFailure(scope, targetId, {
      state,
      failureCount,
      lastFailureAt: now,
      openedAt: shouldOpen ? now : row?.openedAt ?? null,
      nextAttemptAt,
    });

    if (shouldOpen) {
      this.metrics.recordCircuitOpen(scope);
      if (scope === 'wallet') {
        await this.repository.freezeWallet(targetId);
      }
      await this.auditLog.record({
        action: 'circuit.opened',
        entityType: scope,
        entityId: targetId,
        correlationId,
        metadata: { failureCount, threshold: CIRCUIT_FAILURE_THRESHOLD },
      });
      this.logger.warn({
        event: 'circuit.opened',
        scope,
        targetId,
        failureCount,
        threshold: CIRCUIT_FAILURE_THRESHOLD,
        correlationId,
      });
    }
  }

  isInfrastructureFailure(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const msg = error.message.toLowerCase();
    return (
      msg.includes('serialization') ||
      msg.includes('deadlock') ||
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('p2034')
    );
  }
}
