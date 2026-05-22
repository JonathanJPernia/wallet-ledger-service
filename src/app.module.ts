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
import { FeesModule } from './modules/fees/fees.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { WalletsModule } from './modules/wallets/wallets.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    ScheduleModule.forRoot(),
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
    DatabaseLocksModule,
    FeesModule,
    HealthModule,
    WalletsModule,
    ReconciliationModule,
    ReportingModule,
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
