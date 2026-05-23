import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { maybeResetFinancialTestDatabase } from '../support/test-db-bootstrap';
import {
  isRetryableSupertestError,
  sleep,
} from './parallel-http.util';
import { createE2eConcurrencyApp } from './setup-e2e-app';
import { assertReconciliationConsistent } from './e2e-db-assertions';

export const PARALLEL_COUNT = 75;

export type ConcurrencyHarness = {
  app: INestApplication<App>;
  prisma: PrismaService;
  httpServer: Parameters<typeof request>[0];
};

export async function bootstrapConcurrencyHarness(): Promise<ConcurrencyHarness> {
  await maybeResetFinancialTestDatabase();
  const ctx = await createE2eConcurrencyApp();
  const prisma = ctx.module.get(PrismaService);
  const httpServer = ctx.app.getHttpServer();

  await prisma.$queryRaw`SELECT 1`;
  await request(httpServer).get('/api/health').expect(200);

  return {
    app: ctx.app,
    prisma,
    httpServer,
  };
}

export async function teardownConcurrencyHarness(
  harness: ConcurrencyHarness,
): Promise<void> {
  await harness.app.close();
}

export async function createWalletAndDeposit(
  harness: ConcurrencyHarness,
  depositAmount: number,
): Promise<string> {
  const walletRes = await request(harness.httpServer)
    .post('/api/wallets')
    .send({ currency: 'USD' })
    .expect(201);

  const walletId = walletRes.body.data.id as string;

  await request(harness.httpServer)
    .post(`/api/wallets/${walletId}/deposit`)
    .set('Idempotency-Key', `e2e-dep-${randomUUID()}`)
    .send({ amount: depositAmount })
    .expect(201);

  return walletId;
}

export function postWithdraw(
  harness: ConcurrencyHarness,
  walletId: string,
  amount: number,
  idempotencyKey: string,
) {
  return request(harness.httpServer)
    .post(`/api/wallets/${walletId}/withdraw`)
    .timeout({ response: 15_000, deadline: 20_000 })
    .set('Idempotency-Key', idempotencyKey)
    .send({ amount });
}

export async function postWithdrawResilient(
  harness: ConcurrencyHarness,
  walletId: string,
  amount: number,
  idempotencyKey: string,
  maxAttempts = 8,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await postWithdraw(
        harness,
        walletId,
        amount,
        idempotencyKey,
      );
      if (
        (response.status === 503 || response.status === 500) &&
        attempt < maxAttempts
      ) {
        await sleep(80 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableSupertestError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(80 * attempt);
    }
  }
  throw lastError;
}

export async function assertReconciliationConsistentWithRetry(
  harness: ConcurrencyHarness,
  walletId: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await assertReconciliationConsistent(harness.httpServer, walletId);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableSupertestError(error) || attempt === 5) {
        throw error;
      }
      await sleep(150 * attempt);
    }
  }
  throw lastError;
}
