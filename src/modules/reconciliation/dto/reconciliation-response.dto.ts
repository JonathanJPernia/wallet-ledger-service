import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletReconciliationResultDto {
  @ApiProperty({ format: 'uuid' })
  walletId: string;

  @ApiProperty({
    example: '150.00',
    description: 'Balance from SUM(ledger_entries) — source of truth',
  })
  ledgerBalance: string;

  @ApiProperty({
    example: '150.00',
    description: 'wallet.currentBalance projection',
  })
  projectionBalance: string;

  @ApiProperty({
    example: '0.00',
    description: 'projectionBalance - ledgerBalance',
  })
  difference: string;

  @ApiProperty()
  isConsistent: boolean;

  @ApiProperty({
    example: 'RECONCILIATION_DRIFT_DETECTED',
    required: false,
    description: 'Present when isConsistent is false',
  })
  driftCode?: string;
}

export class WalletReconciliationApiResponseDto extends ApiResponseDto<WalletReconciliationResultDto> {
  @ApiProperty({ type: WalletReconciliationResultDto })
  declare data: WalletReconciliationResultDto;
}

export class DriftReportDto {
  @ApiProperty({ example: 2 })
  driftCount: number;

  @ApiProperty({ type: [WalletReconciliationResultDto] })
  drifts: WalletReconciliationResultDto[];

  @ApiProperty()
  scannedAt: string;
}

export class DriftReportApiResponseDto extends ApiResponseDto<DriftReportDto> {
  @ApiProperty({ type: DriftReportDto })
  declare data: DriftReportDto;
}
