import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerConfig } from './common/logger/logger.config';
import { AppConfigModule } from './config/app-config.module';
import { CONFIG_NAMESPACE } from './config/constants';
import type { AppConfig, LogConfig } from './config/configuration';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { DatabaseLocksModule } from './common/database/database-locks.module';
import { ProductionDatabaseModule } from './common/database/production-database.module';
import { AuditLogModule } from './common/observability/audit-log.module';
import { MetricsModule } from './common/observability/metrics.module';
import { FeesModule } from './modules/fees/fees.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { LedgerReplayModule } from './common/ledger/ledger-replay.module';
import { AnomalyModule } from './modules/anomaly/anomaly.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';
import { MaterializedModule } from './modules/materialized/materialized.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { RiskModule } from './modules/risk/risk.module';
import { WalletsModule } from './modules/wallets/wallets.module';

const scheduleImports =
  process.env.E2E_DISABLE_CRONS === 'true' ? [] : [ScheduleModule.forRoot()];

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: Number(process.env.E2E_THROTTLE_LIMIT ?? 10),
      },
    ]),
    ...scheduleImports,
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const app = configService.get<AppConfig>(CONFIG_NAMESPACE.APP)!;
        const log = configService.get<LogConfig>(CONFIG_NAMESPACE.LOG)!;
        return buildLoggerConfig(app.env, log.level);
      },
    }),
    PrismaModule,
    RedisModule,
    MetricsModule,
    AuditLogModule,
    ProductionDatabaseModule,
    DatabaseLocksModule,
    LedgerReplayModule,
    FeesModule,
    EventsModule,
    HealthModule,
    WalletsModule,
    ReconciliationModule,
    ReportingModule,
    AuditModule,
    AnomalyModule,
    RiskModule,
    MaterializedModule,
    MonitoringModule,
    LedgerModule,
    IdempotencyModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
