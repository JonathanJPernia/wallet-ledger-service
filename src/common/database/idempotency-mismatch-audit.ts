import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

const logger = new Logger('IdempotencyMismatchAudit');

export type IdempotencyMismatchAuditPayload = {
  expectedHash: string | null;
  receivedHash: string;
  requestSnapshot: {
    method: string;
    path: string;
    scope: string;
    key: string;
  };
  detectedAt: string;
};

/**
 * Persiste auditoría en TX independiente (no se pierde si el depósito hace rollback).
 */
export async function recordIdempotencyMismatchAudit(
  prisma: PrismaService,
  scope: string,
  key: string,
  audit: Omit<IdempotencyMismatchAuditPayload, 'detectedAt'>,
): Promise<void> {
  const payload: IdempotencyMismatchAuditPayload = {
    ...audit,
    detectedAt: new Date().toISOString(),
  };

  try {
    await prisma.idempotencyKey.update({
      where: { scope_key: { scope, key } },
      data: {
        mismatchAudit: payload,
      },
    });
  } catch (error) {
    logger.error({
      event: 'idempotency.mismatch_audit_failed',
      scope,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
