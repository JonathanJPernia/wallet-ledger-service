import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletRiskResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty({ example: '0.82' })
  riskScore: string;

  @ApiProperty({ enum: ['NORMAL', 'FLAGGED', 'LIMITED', 'BLOCKED'] })
  riskLevel: string;

  @ApiProperty({ type: [String] })
  flags: string[];

  @ApiProperty()
  velocityScore: string;

  @ApiProperty()
  amountAnomalyScore: string;

  @ApiProperty()
  graphScore: string;
}

export class WalletRiskApiResponseDto extends ApiResponseDto<WalletRiskResponseDto> {
  @ApiProperty({ type: WalletRiskResponseDto })
  declare data: WalletRiskResponseDto;
}
