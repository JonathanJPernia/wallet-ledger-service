import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
} from 'class-validator';

export class TransferBodyDto {
  @ApiProperty({ format: 'uuid', description: 'Source wallet' })
  @IsUUID('4')
  fromWalletId: string;

  @ApiProperty({ format: 'uuid', description: 'Destination wallet' })
  @IsUUID('4')
  toWalletId: string;

  @ApiProperty({
    example: 100,
    description:
      'Always positive. Debit/credit via TRANSFER_OUT / TRANSFER_IN.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999_999_999_999.99)
  amount: number;

  @ApiPropertyOptional({ example: 'payout_ref_42' })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
