import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletAnomalyApiResponseDto } from '../dto/anomaly-response.dto';
import { AnomalyDetectionService } from '../services/anomaly-detection.service';

@ApiTags('anomaly')
@Controller('anomaly')
export class AnomalyController {
  constructor(private readonly anomalyService: AnomalyDetectionService) {}

  @Get('wallets/:walletId')
  @ApiOperation({ summary: 'Analyze wallet for velocity/value/graph anomalies' })
  @ApiOkResponse({ type: WalletAnomalyApiResponseDto })
  analyzeWallet(@Param('walletId', ParseUUIDPipe) walletId: string) {
    return this.anomalyService.analyzeWallet(walletId);
  }

  @Get('scan')
  @ApiOperation({ summary: 'System-wide anomaly scan (fee spikes, etc.)' })
  scanSystem(@Query('currency') currency?: string) {
    return this.anomalyService.scanSystem(currency ?? 'USD');
  }
}
