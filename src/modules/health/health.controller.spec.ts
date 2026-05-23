import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { getHealth: jest.Mock };

  beforeEach(async () => {
    healthService = {
      getHealth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns health when database is up', async () => {
    const payload = {
      status: 'ok' as const,
      service: 'wallet-ledger-service',
      version: '0.0.1',
      buildSha: 'abc123',
      environment: 'test',
      uptimeSeconds: 10,
      timestamp: '2026-05-23T00:00:00.000Z',
      database: { status: 'up' as const, latencyMs: 2 },
      memory: { rssMb: 1, heapUsedMb: 1, heapTotalMb: 1 },
    };
    healthService.getHealth.mockResolvedValue(payload);

    await expect(controller.getHealth()).resolves.toEqual(payload);
  });

  it('throws 503 when database is down', async () => {
    healthService.getHealth.mockResolvedValue({
      status: 'error',
      service: 'wallet-ledger-service',
      version: '0.0.1',
      buildSha: null,
      environment: 'test',
      uptimeSeconds: 10,
      timestamp: '2026-05-23T00:00:00.000Z',
      database: { status: 'down', latencyMs: 5 },
      memory: { rssMb: 1, heapUsedMb: 1, heapTotalMb: 1 },
    });

    await expect(controller.getHealth()).rejects.toBeInstanceOf(HttpException);
  });
});
