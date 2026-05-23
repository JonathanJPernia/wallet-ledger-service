import { Injectable, Logger } from '@nestjs/common';
import { FinancialEventType, Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import {
  EventsRepository,
  type RecordFinancialEventInput,
} from '../repositories/events.repository';
import { OutboxRepository } from '../repositories/outbox.repository';

@Injectable()
export class FinancialEventsService {
  private readonly logger = new Logger(FinancialEventsService.name);

  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Outbox en la misma TX que el commit financiero; el worker entrega a financial_events.
   * Si el worker falla, reintenta con backoff y luego DLQ (auditabilidad preservada).
   */
  recordInTransaction(
    tx: Prisma.TransactionClient,
    input: RecordFinancialEventInput & { correlationId?: string },
  ) {
    const correlationId =
      input.correlationId ??
      (typeof input.metadata === 'object' &&
      input.metadata !== null &&
      'correlationId' in input.metadata
        ? String((input.metadata as { correlationId: unknown }).correlationId)
        : undefined);

    return this.outboxRepository.enqueueInTransaction(tx, {
      ...input,
      correlationId,
    });
  }

  async recordDepositCompleted(
    tx: Prisma.TransactionClient,
    input: {
      walletId: string;
      transactionGroupId: string;
      amount: Prisma.Decimal;
      currency: string;
      correlationId?: string;
    },
  ) {
    return this.recordInTransaction(tx, {
      type: FinancialEventType.DEPOSIT_COMPLETED,
      walletId: input.walletId,
      transactionGroupId: input.transactionGroupId,
      amount: input.amount,
      currency: input.currency,
      metadata: { correlationId: input.correlationId },
    });
  }

  async recordTransferCompleted(
    tx: Prisma.TransactionClient,
    input: {
      fromWalletId: string;
      toWalletId: string;
      transactionGroupId: string;
      amount: Prisma.Decimal;
      currency: string;
      feeAmount?: Prisma.Decimal;
      correlationId?: string;
    },
  ) {
    await this.recordInTransaction(tx, {
      type: FinancialEventType.TRANSFER_COMPLETED,
      walletId: input.fromWalletId,
      counterpartyWalletId: input.toWalletId,
      transactionGroupId: input.transactionGroupId,
      amount: input.amount,
      currency: input.currency,
      metadata: { correlationId: input.correlationId, role: 'sender' },
    });

    if (input.feeAmount && input.feeAmount.gt(0)) {
      await this.recordInTransaction(tx, {
        type: FinancialEventType.FEE_APPLIED,
        walletId: input.fromWalletId,
        transactionGroupId: input.transactionGroupId,
        amount: input.feeAmount,
        currency: input.currency,
        metadata: { operation: 'TRANSFER' },
      });
    }

    this.logger.log({
      event: 'events.transfer_recorded',
      transactionGroupId: input.transactionGroupId,
    });
  }

  async recordWithdrawCompleted(
    tx: Prisma.TransactionClient,
    input: {
      walletId: string;
      transactionGroupId: string;
      amount: Prisma.Decimal;
      currency: string;
      feeAmount?: Prisma.Decimal;
      correlationId?: string;
    },
  ) {
    await this.recordInTransaction(tx, {
      type: FinancialEventType.WITHDRAW_COMPLETED,
      walletId: input.walletId,
      transactionGroupId: input.transactionGroupId,
      amount: input.amount,
      currency: input.currency,
      metadata: { correlationId: input.correlationId },
    });

    if (input.feeAmount && input.feeAmount.gt(0)) {
      await this.recordInTransaction(tx, {
        type: FinancialEventType.FEE_APPLIED,
        walletId: input.walletId,
        transactionGroupId: input.transactionGroupId,
        amount: input.feeAmount,
        currency: input.currency,
        metadata: { operation: 'WITHDRAW' },
      });
    }
  }

  async listWalletEvents(
    walletId: string,
    limit?: number,
  ): Promise<ApiResponseDto<unknown[]>> {
    const rows = await this.eventsRepository.listByWallet(walletId, limit ?? 50);
    return buildApiResponse(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        walletId: r.walletId,
        transactionGroupId: r.transactionGroupId,
        amount: r.amount?.toString(),
        currency: r.currency,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }
}
