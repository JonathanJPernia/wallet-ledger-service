import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class TransferResponseDto {
  @ApiProperty({ description: 'Transaction group id (logical transfer)' })
  transferId: string;

  @ApiProperty()
  fromWalletId: string;

  @ApiProperty()
  toWalletId: string;

  @ApiProperty({ example: '50.00' })
  amount: string;

  @ApiProperty({ example: '200.00' })
  fromBalanceBefore: string;

  @ApiProperty({ example: '150.00' })
  fromBalanceAfter: string;

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
