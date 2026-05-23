import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Service health (DB, uptime, memory, version)',
    description:
      'Returns 503 when PostgreSQL is unreachable. Use for Railway/K8s probes.',
  })
  @ApiOkResponse({ type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'Database unreachable or critical check failed',
    type: HealthResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    const health = await this.healthService.getHealth();

    if (health.status !== 'ok') {
      throw new HttpException(health, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return health;
  }
}
