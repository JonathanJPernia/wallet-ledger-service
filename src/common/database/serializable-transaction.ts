import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SerializationFailureException } from '../errors/financial.exceptions';

const logger = new Logger('SerializableTransaction');

/** Reintentos ante 40001 / deadlock — explícito para evitar loops silenciosos. */
export const MAX_SERIALIZABLE_RETRIES = 5;

export const SERIALIZABLE_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 15_000,
} satisfies {
  isolationLevel: Prisma.TransactionIsolationLevel;
  maxWait: number;
  timeout: number;
};

const RETRYABLE_CODES = new Set(['P2034']);

function isSerializationFailure(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_CODES.has(error.code)
  ) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('serialization') ||
      message.includes('40001') ||
      message.includes('40p01') ||
      message.includes('deadlock')
    );
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetrySerializableOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

/**
 * Dinero > performance: reintenta fallos de serialización PostgreSQL (40001 / deadlock).
 */
export async function retrySerializable<T>(
  fn: () => Promise<T>,
  options: RetrySerializableOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_SERIALIZABLE_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? 50;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isSerializationFailure(error) || attempt === maxAttempts) {
        if (isSerializationFailure(error) && attempt === maxAttempts) {
          throw new SerializationFailureException();
        }
        throw error;
      }

      const exponential = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * baseDelayMs);
      const delay = exponential + jitter;
      logger.warn({
        event: 'serialization.retry',
        attempt,
        maxAttempts,
        delayMs: delay,
        jitterMs: jitter,
      });
      await sleep(delay);
    }
  }

  throw new SerializationFailureException();
}
