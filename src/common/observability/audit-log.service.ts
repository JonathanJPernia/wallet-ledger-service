import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type AuditLogInput = {
  action: string;
  entityType: string;
  entityId?: string;
  actor?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: input.actor,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  recordInTransaction(
    tx: Prisma.TransactionClient,
    input: AuditLogInput,
  ): Promise<unknown> {
    return tx.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: input.actor,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }
}
