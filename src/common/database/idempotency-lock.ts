import {
  IdempotencyStatus,
  Prisma,
  TransactionGroupStatus,
  type IdempotencyKey,
} from '@prisma/client';
import {
  IdempotencyConflictException,
  IdempotencyPayloadMismatchException,
} from '../errors/financial.exceptions';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { recordIdempotencyMismatchAudit } from './idempotency-mismatch-audit';

export type IdempotencyClaimInput = {
  scope: string;
  key: string;
  requestHash: string;
  requestMethod: string;
  requestPath: string;
  expiresAt: Date;
};

export type IdempotencyClaimResult =
  | { kind: 'execute'; record: IdempotencyKey }
  | { kind: 'cached'; record: IdempotencyKey };

export type IdempotencyClaimOptions = {
  /** Prisma root (fuera de TX) para auditoría de mismatch que debe persistir. */
  auditPrisma?: PrismaService;
};

function isCommittedReplay(record: IdempotencyKey): boolean {
  return (
    record.status === IdempotencyStatus.COMPLETED &&
    record.responseStatus != null &&
    record.responseBody != null &&
    record.transactionGroupId != null
  );
}

async function loadLinkedGroup(
  tx: Prisma.TransactionClient,
  transactionGroupId: string,
) {
  return tx.transactionGroup.findUnique({
    where: { id: transactionGroupId },
    select: { id: true, status: true },
  });
}

/**
 * Paso 1 del lock order global. Debe ejecutarse antes de cualquier lock de wallet.
 */
export async function claimIdempotencyInTransaction(
  tx: Prisma.TransactionClient,
  input: IdempotencyClaimInput,
  options: IdempotencyClaimOptions = {},
): Promise<IdempotencyClaimResult> {
  const rows = await tx.$queryRaw<IdempotencyKey[]>`
    SELECT *
    FROM idempotency_keys
    WHERE scope = ${input.scope}
      AND key = ${input.key}
    FOR UPDATE
  `;

  const existing = rows[0];

  if (existing) {
    if (existing.requestHash && existing.requestHash !== input.requestHash) {
      if (options.auditPrisma) {
        await recordIdempotencyMismatchAudit(
          options.auditPrisma,
          input.scope,
          input.key,
          {
            expectedHash: existing.requestHash,
            receivedHash: input.requestHash,
            requestSnapshot: {
              method: input.requestMethod,
              path: input.requestPath,
              scope: input.scope,
              key: input.key,
            },
          },
        );
      }

      throw new IdempotencyPayloadMismatchException(input.key);
    }

    if (isCommittedReplay(existing)) {
      if (!existing.transactionGroupId) {
        throw new IdempotencyConflictException(
          input.key,
          'Idempotency COMPLETED without transactionGroupId (invariant violation)',
        );
      }

      const group = await loadLinkedGroup(tx, existing.transactionGroupId);
      if (group?.status === TransactionGroupStatus.COMPLETED) {
        return { kind: 'cached', record: existing };
      }

      throw new IdempotencyConflictException(
        input.key,
        'Idempotency COMPLETED but transaction group is not COMPLETED (invariant violation)',
      );
    }

    if (existing.status === IdempotencyStatus.PROCESSING) {
      throw new IdempotencyConflictException(input.key);
    }

    if (existing.status === IdempotencyStatus.FAILED) {
      if (existing.transactionGroupId) {
        const group = await loadLinkedGroup(tx, existing.transactionGroupId);
        if (group?.status === TransactionGroupStatus.COMPLETED) {
          if (isCommittedReplay(existing)) {
            return { kind: 'cached', record: existing };
          }
          throw new IdempotencyConflictException(
            input.key,
            'Completed transaction group without idempotency response',
          );
        }
        if (group?.status === TransactionGroupStatus.PENDING) {
          throw new IdempotencyConflictException(
            input.key,
            'Stale in-flight operation; manual reconciliation required',
          );
        }
      }

      const record = await tx.idempotencyKey.update({
        where: { id: existing.id },
        data: {
          status: IdempotencyStatus.PROCESSING,
          requestMethod: input.requestMethod,
          requestPath: input.requestPath,
          requestHash: input.requestHash,
          expiresAt: input.expiresAt,
          responseStatus: null,
          responseBody: Prisma.JsonNull,
          transactionGroupId: null,
        },
      });
      return { kind: 'execute', record };
    }
  }

  const record = await tx.idempotencyKey.create({
    data: {
      key: input.key,
      scope: input.scope,
      status: IdempotencyStatus.PROCESSING,
      requestMethod: input.requestMethod,
      requestPath: input.requestPath,
      requestHash: input.requestHash,
      expiresAt: input.expiresAt,
    },
  });

  return { kind: 'execute', record };
}
