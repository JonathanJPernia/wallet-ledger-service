import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WithdrawResponseDto {
  @ApiProperty({ description: 'Transaction group id (logical withdraw)' })
  withdrawId: string;

  @ApiProperty()
  ledgerEntryId: string;

  @ApiProperty()
  walletId: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: '50.00', description: 'Base withdraw amount (excludes fee)' })
  amount: string;

  @ApiProperty({ example: '50.00' })
  baseAmount: string;

  @ApiProperty({ example: '0.50' })
  feeAmount: string;

  @ApiProperty({ example: '50.50', description: 'Total debited (base + fee)' })
  totalDeducted: string;

  @ApiProperty({ example: '100.00' })
  balanceBefore: string;

  @ApiProperty({ example: '49.50' })
  balanceAfter: string;

  @ApiProperty({ example: '0.50', required: false })
  systemFeeWalletBalanceAfter?: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: 'COMPLETED';

  @ApiProperty()
  idempotencyKey: string;
}

export class WithdrawApiResponseDto extends ApiResponseDto<WithdrawResponseDto> {
  @ApiProperty({ type: WithdrawResponseDto })
  declare data: WithdrawResponseDto;
}
