import { Injectable } from '@nestjs/common';
import { CircuitState } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type CircuitScope = 'wallet' | 'system';

@Injectable()
export class CircuitBreakerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(scope: CircuitScope, targetId: string) {
    return this.prisma.walletCircuitBreaker.findUnique({
      where: { scope_targetId: { scope, targetId } },
    });
  }

  async upsertFailure(
    scope: CircuitScope,
    targetId: string,
    input: {
      state: CircuitState;
      failureCount: number;
      openedAt?: Date | null;
      lastFailureAt: Date;
      nextAttemptAt?: Date | null;
    },
  ) {
    return this.prisma.walletCircuitBreaker.upsert({
      where: { scope_targetId: { scope, targetId } },
      create: {
        scope,
        targetId,
        state: input.state,
        failureCount: input.failureCount,
        openedAt: input.openedAt ?? undefined,
        lastFailureAt: input.lastFailureAt,
        nextAttemptAt: input.nextAttemptAt ?? undefined,
      },
      update: {
        state: input.state,
        failureCount: input.failureCount,
        openedAt: input.openedAt ?? undefined,
        lastFailureAt: input.lastFailureAt,
        nextAttemptAt: input.nextAttemptAt ?? undefined,
        successCount: 0,
      },
    });
  }

  async updateState(
    scope: CircuitScope,
    targetId: string,
    input: {
      state?: CircuitState;
      failureCount?: number;
      successCount?: number;
      openedAt?: Date | null;
      nextAttemptAt?: Date | null;
    },
  ) {
    return this.prisma.walletCircuitBreaker.update({
      where: { scope_targetId: { scope, targetId } },
      data: input,
    });
  }

  async freezeWallet(walletId: string): Promise<void> {
    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { status: 'FROZEN' },
    });
  }

  async unfreezeWallet(walletId: string): Promise<void> {
    await this.prisma.wallet.update({
      where: { id: walletId },
      data: { status: 'ACTIVE' },
    });
  }
}
