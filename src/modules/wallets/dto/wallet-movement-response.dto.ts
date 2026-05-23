import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OperationType } from '@prisma/client';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletMovementDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: OperationType })
  operationType: OperationType;

  @ApiProperty({ example: '50.00', description: 'Absolute amount (always positive)' })
  amount: string;

  @ApiProperty({
    example: '-20.00',
    description: 'Signed effect on wallet balance',
  })
  signedAmount: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: '100.00' })
  balanceBefore: string;

  @ApiProperty({ example: '80.00' })
  balanceAfter: string;

  @ApiPropertyOptional({ format: 'uuid' })
  transactionGroupId?: string | null;

  @ApiPropertyOptional()
  correlationId?: string | null;

  @ApiProperty()
  createdAt: string;
}

export class WalletMovementsListDto {
  @ApiProperty({ format: 'uuid' })
  walletId: string;

  @ApiProperty({ type: [WalletMovementDto] })
  movements: WalletMovementDto[];

  @ApiProperty()
  count: number;

  @ApiProperty()
  hasMore: boolean;

  @ApiPropertyOptional({
    description: 'Pass as ?cursor= on the next request',
  })
  nextCursor?: string;
}

export class WalletMovementsApiResponseDto extends ApiResponseDto<WalletMovementsListDto> {
  @ApiProperty({ type: WalletMovementsListDto })
  declare data: WalletMovementsListDto;
}
