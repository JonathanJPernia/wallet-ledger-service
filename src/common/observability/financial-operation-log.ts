import { Logger } from '@nestjs/common';
import { DomainException } from '../errors/domain.exception';
import { InsufficientFundsException } from '../errors/financial.exceptions';

export type FinancialOperationContext = {
  operation: 'withdraw' | 'deposit' | 'transfer';
  walletId?: string;
  fromWalletId?: string;
  toWalletId?: string;
  amount?: string;
  idempotencyKey?: string;
  correlationId?: string;
};

export function logInsufficientFunds(
  logger: Logger,
  ctx: FinancialOperationContext,
  walletId: string,
  balance: string,
  requested: string,
): void {
  logger.warn({
    event: `${ctx.operation}.insufficient_funds`,
    walletId,
    currentBalance: balance,
    requestedAmount: requested,
    idempotencyKey: ctx.idempotencyKey,
    correlationId: ctx.correlationId,
  });
}

export function logOperationFailed(
  logger: Logger,
  ctx: FinancialOperationContext,
  error: unknown,
): void {
  const payload: Record<string, unknown> = {
    event: `${ctx.operation}.failed`,
    idempotencyKey: ctx.idempotencyKey,
    correlationId: ctx.correlationId,
    walletId: ctx.walletId,
    fromWalletId: ctx.fromWalletId,
    toWalletId: ctx.toWalletId,
    amount: ctx.amount,
  };

  if (error instanceof DomainException) {
    payload.errorCode = error.errorCode;
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      payload.message = (body as { message: string }).message;
    }
  } else if (error instanceof Error) {
    payload.message = error.message;
  }

  logger.warn(payload);
}

export function isInsufficientFunds(error: unknown): boolean {
  return error instanceof InsufficientFundsException;
}
