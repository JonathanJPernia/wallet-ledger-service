import { CanActivate, ExecutionContext, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LedgerPartitionCron } from '../../src/common/database/ledger-partition.cron';
import { CircuitBreakerService } from '../../src/modules/circuit-breaker/circuit-breaker.service';
import { OutboxDispatchCron } from '../../src/modules/events/jobs/outbox-dispatch.cron';
import { MaterializedRefreshCron } from '../../src/modules/materialized/jobs/materialized-refresh.cron';
import { SnapshotCron } from '../../src/modules/reporting/jobs/snapshot.cron';
import { RiskScoringService } from '../../src/modules/risk/services/risk-scoring.service';
import type { WalletRiskResponseDto } from '../../src/modules/risk/dto/risk-response.dto';

const noopCron = {};

@Injectable()
class AllowAllGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}

const passthroughRiskAssessment: WalletRiskResponseDto = {
  walletId: '',
  riskScore: '0.00',
  riskLevel: 'NORMAL',
  flags: [],
  velocityScore: '0.00',
  amountAnomalyScore: '0.00',
  graphScore: '0.00',
};

export type E2eAppOptions = {
  /** Desactiva rate limit (necesario para 50–100 requests paralelos). */
  disableThrottler?: boolean;
  /** Desactiva bloqueo por risk velocity (no es lógica ledger). */
  disableRiskGuard?: boolean;
  /** Evita crons que compiten por conexiones DB durante E2E. */
  disableCrons?: boolean;
};

function buildTestingModule(options: E2eAppOptions = {}) {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.disableThrottler) {
    builder = builder.overrideProvider(APP_GUARD).useClass(AllowAllGuard);
  }

  const disableCrons =
    options.disableCrons ?? process.env.E2E_DISABLE_CRONS === 'true';

  if (disableCrons) {
    builder = builder
      .overrideProvider(OutboxDispatchCron)
      .useValue(noopCron)
      .overrideProvider(MaterializedRefreshCron)
      .useValue(noopCron)
      .overrideProvider(SnapshotCron)
      .useValue(noopCron)
      .overrideProvider(LedgerPartitionCron)
      .useValue(noopCron);
  }

  if (options.disableRiskGuard) {
    builder = builder.overrideProvider(CircuitBreakerService).useValue({
      assertWalletOperational: async () => undefined,
      assertOperational: async () => undefined,
      recordSuccess: async () => undefined,
      recordFailure: async () => undefined,
      isInfrastructureFailure: () => false,
    });

    builder = builder.overrideProvider(RiskScoringService).useValue({
      assessWallet: async (walletId: string) => ({
        data: { ...passthroughRiskAssessment, walletId },
        meta: { timestamp: new Date().toISOString() },
      }),
      assertWalletAllowed: async (walletId: string) => ({
        ...passthroughRiskAssessment,
        walletId,
      }),
    });
  }

  return builder;
}

export async function createE2eApp(
  options: E2eAppOptions = {},
): Promise<{
  app: INestApplication<App>;
  module: TestingModule;
}> {
  const module = await buildTestingModule(options).compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  return { app, module };
}

/** App E2E para pruebas de concurrencia (sin throttle ni risk velocity). */
export function createE2eConcurrencyApp() {
  return createE2eApp({
    disableThrottler: true,
    disableRiskGuard: true,
    disableCrons: true,
  });
}
