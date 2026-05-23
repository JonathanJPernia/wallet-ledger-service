import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CONFIG_NAMESPACE } from '../../config/constants';
import type { AppConfig } from '../../config/configuration';
import type { HealthResponseDto } from './dto/health-response.dto';

@Injectable()
export class HealthService {
  private readonly bootedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getHealth(): Promise<HealthResponseDto> {
    const app = this.configService.get<AppConfig>(CONFIG_NAMESPACE.APP)!;

    const dbStarted = Date.now();
    const databaseUp = await this.prisma.ping();
    const databaseLatencyMs = Date.now() - dbStarted;

    const memory = process.memoryUsage();

    return {
      status: databaseUp ? 'ok' : 'error',
      service: app.name,
      version: app.version,
      buildSha: app.buildSha,
      environment: app.env,
      uptimeSeconds: Number(
        ((Date.now() - this.bootedAt) / 1000).toFixed(2),
      ),
      timestamp: new Date().toISOString(),
      database: {
        status: databaseUp ? 'up' : 'down',
        latencyMs: databaseLatencyMs,
      },
      memory: {
        rssMb: bytesToMb(memory.rss),
        heapUsedMb: bytesToMb(memory.heapUsed),
        heapTotalMb: bytesToMb(memory.heapTotal),
      },
    };
  }
}

function bytesToMb(bytes: number): number {
  return Number((bytes / 1024 / 1024).toFixed(2));
}
