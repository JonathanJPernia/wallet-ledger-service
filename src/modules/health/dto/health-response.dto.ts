import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthCheckDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiPropertyOptional({ example: 4 })
  latencyMs?: number;
}

export class HealthMemoryDto {
  @ApiProperty({ example: 128.5, description: 'RSS in megabytes' })
  rssMb: number;

  @ApiProperty({ example: 64.2, description: 'Heap used in megabytes' })
  heapUsedMb: number;

  @ApiProperty({ example: 72.0, description: 'Heap total in megabytes' })
  heapTotalMb: number;
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @ApiProperty({ example: 'wallet-ledger-service' })
  service: string;

  @ApiProperty({ example: '0.0.1' })
  version: string;

  @ApiPropertyOptional({
    example: 'a1b2c3d4',
    description: 'Railway: RAILWAY_GIT_COMMIT_SHA; Docker: BUILD_SHA',
  })
  buildSha: string | null;

  @ApiProperty({ example: 'production' })
  environment: string;

  @ApiProperty({ example: 3600.12, description: 'Process uptime in seconds' })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-05-23T18:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ type: HealthCheckDto })
  database: HealthCheckDto;

  @ApiProperty({ type: HealthMemoryDto })
  memory: HealthMemoryDto;
}
