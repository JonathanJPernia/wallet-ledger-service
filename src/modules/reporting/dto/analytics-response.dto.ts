import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletAnalyticsResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  period: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty({ example: '1000.00' })
  totalDeposits: string;

  @ApiProperty({ example: '300.00' })
  totalWithdrawals: string;

  @ApiProperty()
  totalTransferIn: string;

  @ApiProperty()
  totalTransferOut: string;

  @ApiProperty()
  totalFeesOut: string;

  @ApiProperty({ example: '700.00' })
  netFlow: string;
}

export class TopWalletVolumeDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  volume: string;

  @ApiProperty()
  entryCount: number;
}

export class SystemAnalyticsResponseDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  totalTransfers: number;

  @ApiProperty()
  transferVolume: string;

  @ApiProperty()
  totalWithdrawals: number;

  @ApiProperty()
  withdrawVolume: string;

  @ApiProperty()
  totalDeposits: number;

  @ApiProperty()
  depositVolume: string;

  @ApiProperty()
  totalFeesCollected: string;

  @ApiProperty({ type: [TopWalletVolumeDto] })
  topWalletsByVolume: TopWalletVolumeDto[];
}

export class RebuildWalletResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  toDate: string;

  @ApiProperty()
  ledgerBalance: string;

  @ApiProperty()
  projectionBalance: string;

  @ApiProperty()
  difference: string;

  @ApiProperty()
  isConsistent: boolean;

  @ApiProperty({ example: 'ledger' })
  sourceOfTruth: 'ledger';
}

export class WalletAnalyticsApiResponseDto extends ApiResponseDto<WalletAnalyticsResponseDto> {
  @ApiProperty({ type: WalletAnalyticsResponseDto })
  declare data: WalletAnalyticsResponseDto;
}

export class SystemAnalyticsApiResponseDto extends ApiResponseDto<SystemAnalyticsResponseDto> {
  @ApiProperty({ type: SystemAnalyticsResponseDto })
  declare data: SystemAnalyticsResponseDto;
}

export class RebuildWalletApiResponseDto extends ApiResponseDto<RebuildWalletResponseDto> {
  @ApiProperty({ type: RebuildWalletResponseDto })
  declare data: RebuildWalletResponseDto;
}
