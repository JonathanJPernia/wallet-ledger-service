import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletReplayResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  toDate: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  ledgerBalance: string;

  @ApiProperty()
  entryCountSource: string;

  @ApiProperty({ example: 'ledger' })
  sourceOfTruth: 'ledger';
}

export class WalletDiffResponseDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  toDate: string;

  @ApiProperty()
  projectionBalance: string;

  @ApiProperty()
  ledgerRebuild: string;

  @ApiProperty()
  difference: string;

  @ApiProperty()
  isConsistent: boolean;

  @ApiProperty()
  sourceOfTruth: 'ledger';

  @ApiProperty()
  note: string;
}

export class SystemWalletRebuildRowDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  ledgerBalance: string;

  @ApiProperty()
  projectionBalance: string;

  @ApiProperty()
  difference: string;

  @ApiProperty()
  isConsistent: boolean;
}

export class SystemRebuildResponseDto {
  @ApiProperty()
  toDate: string;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  totalLedgerBalance: string;

  @ApiProperty()
  walletCount: number;

  @ApiProperty()
  inconsistentWalletCount: number;

  @ApiProperty({ type: [SystemWalletRebuildRowDto] })
  wallets: SystemWalletRebuildRowDto[];

  @ApiProperty()
  sourceOfTruth: 'ledger';
}

export class WalletReplayApiResponseDto extends ApiResponseDto<WalletReplayResponseDto> {
  @ApiProperty({ type: WalletReplayResponseDto })
  declare data: WalletReplayResponseDto;
}

export class WalletDiffApiResponseDto extends ApiResponseDto<WalletDiffResponseDto> {
  @ApiProperty({ type: WalletDiffResponseDto })
  declare data: WalletDiffResponseDto;
}

export class SystemRebuildApiResponseDto extends ApiResponseDto<SystemRebuildResponseDto> {
  @ApiProperty({ type: SystemRebuildResponseDto })
  declare data: SystemRebuildResponseDto;
}
