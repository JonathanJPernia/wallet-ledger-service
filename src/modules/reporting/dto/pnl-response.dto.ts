import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class FeeBreakdownDto {
  @ApiProperty({ example: '800.25' })
  TRANSFER: string;

  @ApiProperty({ example: '450.25' })
  WITHDRAW: string;

  @ApiProperty({ example: '0.00' })
  DEPOSIT: string;
}

export class PnlResponseDto {
  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  period: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: '1250.50' })
  totalRevenue: string;

  @ApiProperty({ type: FeeBreakdownDto })
  feeBreakdown: FeeBreakdownDto;

  @ApiProperty({ example: '1250.50' })
  netProfit: string;
}

export class PnlApiResponseDto extends ApiResponseDto<PnlResponseDto> {
  @ApiProperty({ type: PnlResponseDto })
  declare data: PnlResponseDto;
}
