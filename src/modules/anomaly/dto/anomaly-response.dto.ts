import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletAnomalyResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty({ example: '0.82' })
  riskScore: string;

  @ApiProperty()
  walletVelocityScore: string;

  @ApiProperty()
  transactionVelocityScore: string;

  @ApiProperty()
  amountZScore: string;

  @ApiProperty()
  graphCentralityScore: string;

  @ApiProperty({ type: [String] })
  flags: string[];

  @ApiProperty()
  windowStart: string;

  @ApiProperty()
  windowEnd: string;
}

export class WalletAnomalyApiResponseDto extends ApiResponseDto<WalletAnomalyResponseDto> {
  @ApiProperty({ type: WalletAnomalyResponseDto })
  declare data: WalletAnomalyResponseDto;
}
