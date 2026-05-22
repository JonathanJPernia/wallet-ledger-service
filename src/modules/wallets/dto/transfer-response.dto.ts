import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class TransferResponseDto {
  @ApiProperty({ description: 'Transaction group id (logical transfer)' })
  transferId: string;

  @ApiProperty()
  fromWalletId: string;

  @ApiProperty()
  toWalletId: string;

  @ApiProperty({ example: '50.00', description: 'Base transfer amount (excludes fee)' })
  amount: string;

  @ApiProperty({ example: '50.00', description: 'Same as amount' })
  baseAmount: string;

  @ApiProperty({ example: '0.25' })
  feeAmount: string;

  @ApiProperty({ example: '50.25', description: 'Total debited from sender (base + fee)' })
  totalDeducted: string;

  @ApiProperty({ example: '200.00' })
  fromBalanceBefore: string;

  @ApiProperty({ example: '149.75' })
  fromBalanceAfter: string;

  @ApiProperty({ example: '0.25', required: false })
  systemFeeWalletBalanceAfter?: string;

  @ApiProperty({ example: '0.00' })
  toBalanceBefore: string;

  @ApiProperty({ example: '50.00' })
  toBalanceAfter: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: 'COMPLETED';

  @ApiProperty()
  idempotencyKey: string;
}

export class TransferApiResponseDto extends ApiResponseDto<TransferResponseDto> {
  @ApiProperty({ type: TransferResponseDto })
  declare data: TransferResponseDto;
}
