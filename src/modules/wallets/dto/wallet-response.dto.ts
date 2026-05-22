import { ApiProperty } from '@nestjs/swagger';
import { Wallet, WalletStatus } from '@prisma/client';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class WalletResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    example: '0.00',
    description: 'Always positive; Decimal(18,2)',
  })
  currentBalance: string;

  @ApiProperty({ enum: WalletStatus, example: WalletStatus.ACTIVE })
  status: WalletStatus;

  @ApiProperty({ example: 1, description: 'Optimistic locking version' })
  version: number;

  @ApiProperty({ example: '2026-05-22T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-05-22T12:00:00.000Z' })
  updatedAt: string;
}

export class WalletApiResponseDto extends ApiResponseDto<WalletResponseDto> {
  @ApiProperty({ type: WalletResponseDto })
  declare data: WalletResponseDto;
}

export class WalletResponseMapper {
  static fromEntity(wallet: Wallet): WalletResponseDto {
    return {
      id: wallet.id,
      currency: wallet.currency,
      currentBalance: wallet.currentBalance.toFixed(2),
      status: wallet.status,
      version: wallet.version,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }
}
