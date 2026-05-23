import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { CONFIG_NAMESPACE } from '../../config/constants';
import type { DatabaseConfig } from '../../config/configuration';
import { resolvePrismaLogLevels } from './prisma-log.config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly configService: ConfigService) {
    const database = configService.get<DatabaseConfig>(
      CONFIG_NAMESPACE.DATABASE,
    )!;
    const logLevels = resolvePrismaLogLevels();
    super({
      datasources: {
        db: { url: database.url },
      },
      log: logLevels,
    });
    this.logger.log(`Prisma log levels: ${logLevels.join(', ')}`);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
