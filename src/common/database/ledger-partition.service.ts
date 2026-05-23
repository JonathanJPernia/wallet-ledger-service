import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** Meses hacia adelante que se pre-crean en cada run del cron. */
export const PARTITION_MONTHS_AHEAD = 3;

@Injectable()
export class LedgerPartitionService implements OnModuleInit {
  private readonly logger = new Logger(LedgerPartitionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensurePartitions();
    } catch (error) {
      this.logger.warn({
        event: 'ledger.partition_bootstrap_skipped',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Crea particiones mensuales faltantes vía función SQL `ensure_ledger_month_partition`.
   * PostgreSQL hace partition pruning cuando el WHERE incluye createdAt acotado.
   */
  async ensurePartitions(monthsAhead = PARTITION_MONTHS_AHEAD): Promise<string[]> {
    const created: string[] = [];
    const start = this.utcMonthStart(new Date());

    for (let i = 0; i <= monthsAhead; i++) {
      const month = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
      );
      const monthDate = month.toISOString().slice(0, 10);

      await this.prisma.$executeRaw`
        SELECT ensure_ledger_month_partition(${monthDate}::date)
      `;

      const name = `ledger_entries_${month.getUTCFullYear()}_${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
      created.push(name);
    }

    this.logger.log({
      event: 'ledger.partitions_ensured',
      partitions: created,
      monthsAhead,
    });

    return created;
  }

  /** EXPLAIN para verificar partition pruning en consultas acotadas por fecha. */
  async explainPartitionPruning(
    walletId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ plan: string }[]>`
      EXPLAIN (FORMAT TEXT)
      SELECT COUNT(*)::int
      FROM ledger_entries
      WHERE "walletId" = ${walletId}
        AND "createdAt" >= ${rangeStart}
        AND "createdAt" < ${rangeEnd}
    `;
    return rows.map((r) => r.plan).join('\n');
  }

  private utcMonthStart(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    );
  }
}
