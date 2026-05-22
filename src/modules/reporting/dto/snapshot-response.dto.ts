import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class FinancialSnapshotDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '2026-05-20' })
  date: string;

  @ApiProperty({ description: 'Inclusive UTC start of closing period' })
  periodStart: string;

  @ApiProperty({ description: 'Exclusive UTC end of closing period' })
  periodEnd: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty()
  totalSystemBalance: string;

  @ApiProperty()
  totalFeeRevenue: string;

  @ApiProperty()
  totalVolume: string;

  @ApiProperty()
  createdAt: string;
}

export class SnapshotListApiResponseDto extends ApiResponseDto<FinancialSnapshotDto[]> {
  @ApiProperty({ type: [FinancialSnapshotDto] })
  declare data: FinancialSnapshotDto[];
}

export class SnapshotApiResponseDto extends ApiResponseDto<FinancialSnapshotDto> {
  @ApiProperty({ type: FinancialSnapshotDto })
  declare data: FinancialSnapshotDto;
}
