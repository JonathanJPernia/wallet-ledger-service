import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LiveMonitoringApiResponseDto } from '../dto/monitoring-response.dto';
import { FinancialMonitoringService } from '../services/financial-monitoring.service';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: FinancialMonitoringService) {}

  @Get('live')
  @ApiOperation({ summary: 'Real-time financial monitoring metrics' })
  @ApiOkResponse({ type: LiveMonitoringApiResponseDto })
  getLive(@Query('currency') currency?: string) {
    return this.monitoringService.getLiveMetrics(currency ?? 'USD');
  }
}
