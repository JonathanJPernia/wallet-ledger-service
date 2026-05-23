import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletRiskApiResponseDto } from '../dto/risk-response.dto';
import { RiskScoringService } from '../services/risk-scoring.service';

@ApiTags('risk')
@Controller('risk')
export class RiskController {
  constructor(private readonly riskScoringService: RiskScoringService) {}

  @Get('wallets/:walletId')
  @ApiOperation({ summary: 'Composite fraud/risk score for wallet' })
  @ApiOkResponse({ type: WalletRiskApiResponseDto })
  assessWallet(@Param('walletId', ParseUUIDPipe) walletId: string) {
    return this.riskScoringService.assessWallet(walletId);
  }
}
