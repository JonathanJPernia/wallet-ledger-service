import { Logger } from '@nestjs/common';
import { IdempotencyStatus, Prisma, type IdempotencyKey } from '@prisma/client';
import { DomainException } from '../errors/domain.exception';
import {
  ConcurrencyConflictException,
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
  SerializationFailureException,
} from '../errors/financial.exceptions';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

const logger = new Logger('IdempotencyFailure');

export type RecordIdempotencyFailureInput = {
  scope: string;
  key: string;
  requestHash?: string;
  requestMethod?: string;
  requestPath?: string;
  reason: string;
  errorCode?: string;
};

/**
 * Persiste FAILED en TX independiente (después del rollback de la TX financiera).
 * No ejecutar dentro de una TX abortada (25P02).
 */
export async function recordIdempotencyFailureOutsideTx(
  prisma: PrismaService,
  input: RecordIdempotencyFailureInput,
): Promise<IdempotencyKey | null> {
  try {
    const record = await prisma.idempotencyKey.upsert({
      where: { scope_key: { scope: input.scope, key: input.key } },
      create: {
        scope: input.scope,
        key: input.key,
        status: IdempotencyStatus.FAILED,
        requestHash: input.requestHash,
        requestMethod: input.requestMethod,
        requestPath: input.requestPath,
        failureReason: input.reason,
        failedAt: new Date(),
      },
      update: {
        status: IdempotencyStatus.FAILED,
        failureReason: input.reason,
        failedAt: new Date(),
        requestHash: input.requestHash ?? undefined,
        requestMethod: input.requestMethod ?? undefined,
        requestPath: input.requestPath ?? undefined,
        responseStatus: null,
        responseBody: Prisma.JsonNull,
        transactionGroupId: null,
      },
    });

    logger.warn({
      event: 'idempotency.marked_failed',
      scope: input.scope,
      key: input.key,
      errorCode: input.errorCode,
      reason: input.reason,
    });

    return record;
  } catch (error) {
    logger.error({
      event: 'idempotency.mark_failed_error',
      scope: input.scope,
      key: input.key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Errores que no deben marcar FAILED (reintento cliente o conflicto esperado). */
export function shouldPersistIdempotencyFailure(error: unknown): boolean {
  if (error instanceof SerializationFailureException) {
    return false;
  }
  if (error instanceof IdempotencyConflictException) {
    return false;
  }
  if (error instanceof IdempotencyPayloadMismatchException) {
    return false;
  }
  if (error instanceof ConcurrencyConflictException) {
    return false;
  }
  if (error instanceof DomainException) {
    return true;
  }
  return true;
}

export function failureReasonFromError(error: unknown): string {
  if (error instanceof DomainException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      return String((body as { message: string }).message);
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function failureErrorCodeFromError(error: unknown): string | undefined {
  if (error instanceof DomainException) {
    return error.errorCode;
  }
  return undefined;
}
