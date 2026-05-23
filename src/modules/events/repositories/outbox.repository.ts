import { Injectable } from '@nestjs/common';
import {
  FinancialEventType,
  OutboxStatus,
  Prisma,
  type FinancialEventOutbox,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import type { RecordFinancialEventInput } from './events.repository';

const OUTBOX_BATCH_SIZE = 50;
const RETRY_BASE_MS = 5_000;

@Injectable()
export class OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  enqueueInTransaction(
    tx: Prisma.TransactionClient,
    input: RecordFinancialEventInput & { correlationId?: string },
  ): Promise<FinancialEventOutbox> {
    return tx.financialEventOutbox.create({
      data: {
        type: input.type,
        walletId: input.walletId,
        counterpartyWalletId: input.counterpartyWalletId,
        transactionGroupId: input.transactionGroupId,
        amount: input.amount,
        currency: input.currency,
        metadata: input.metadata ?? undefined,
        correlationId: input.correlationId,
        status: OutboxStatus.PENDING,
      },
    });
  }

  async claimPendingBatch(limit = OUTBOX_BATCH_SIZE): Promise<FinancialEventOutbox[]> {
    const now = new Date();
    const pending = await this.prisma.financialEventOutbox.findMany({
      where: {
        status: OutboxStatus.PENDING,
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const claimed: FinancialEventOutbox[] = [];
    for (const row of pending) {
      const updated = await this.prisma.financialEventOutbox.updateMany({
        where: { id: row.id, status: OutboxStatus.PENDING },
        data: { status: OutboxStatus.PROCESSING, updatedAt: new Date() },
      });
      if (updated.count === 1) {
        claimed.push({ ...row, status: OutboxStatus.PROCESSING });
      }
    }
    return claimed;
  }

  async markDelivered(id: string): Promise<void> {
    await this.prisma.financialEventOutbox.update({
      where: { id },
      data: { status: OutboxStatus.DELIVERED, updatedAt: new Date() },
    });
  }

  async markRetry(id: string, attempts: number, maxAttempts: number, error: string): Promise<void> {
    const nextAttempts = attempts + 1;
    if (nextAttempts >= maxAttempts) {
      await this.moveToDlq(id, error, nextAttempts);
      return;
    }

    const delayMs = RETRY_BASE_MS * Math.pow(2, nextAttempts - 1);
    await this.prisma.financialEventOutbox.update({
      where: { id },
      data: {
        status: OutboxStatus.PENDING,
        attempts: nextAttempts,
        lastError: error,
        nextRetryAt: new Date(Date.now() + delayMs),
        updatedAt: new Date(),
      },
    });
  }

  private async moveToDlq(id: string, error: string, attempts: number): Promise<void> {
    const row = await this.prisma.financialEventOutbox.findUniqueOrThrow({
      where: { id },
    });

    await this.prisma.$transaction([
      this.prisma.financialEventOutbox.update({
        where: { id },
        data: { status: OutboxStatus.DLQ, lastError: error, updatedAt: new Date() },
      }),
      this.prisma.financialEventDlq.create({
        data: {
          outboxId: id,
          type: row.type,
          payload: {
            walletId: row.walletId,
            counterpartyWalletId: row.counterpartyWalletId,
            transactionGroupId: row.transactionGroupId,
            amount: row.amount?.toString(),
            currency: row.currency,
            metadata: row.metadata,
            correlationId: row.correlationId,
          },
          lastError: error,
          attempts,
        },
      }),
    ]);
  }

  async deliverToFinancialEvents(row: FinancialEventOutbox): Promise<void> {
    await this.prisma.financialEvent.create({
      data: {
        type: row.type,
        walletId: row.walletId,
        counterpartyWalletId: row.counterpartyWalletId,
        transactionGroupId: row.transactionGroupId,
        amount: row.amount,
        currency: row.currency,
        metadata: row.metadata ?? undefined,
      },
    });
  }
}

export type { FinancialEventType };
