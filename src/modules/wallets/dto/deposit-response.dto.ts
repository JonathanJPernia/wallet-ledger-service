import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class DepositResponseDto {
  @ApiProperty()
  transactionGroupId: string;

  @ApiProperty()
  ledgerEntryId: string;

  @ApiProperty()
  walletId: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: '100.00' })
  amount: string;

  @ApiProperty({ example: '500.00' })
  balanceBefore: string;

  @ApiProperty({ example: '600.00' })
  balanceAfter: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: 'COMPLETED';

  @ApiProperty({ example: 'dep-abc-123' })
  idempotencyKey: string;
}

export class DepositApiResponseDto extends ApiResponseDto<DepositResponseDto> {
  @ApiProperty({ type: DepositResponseDto })
  declare data: DepositResponseDto;
}
