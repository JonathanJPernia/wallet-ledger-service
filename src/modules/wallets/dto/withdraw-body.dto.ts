import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';

export class WithdrawBodyDto {
  @ApiProperty({
    example: 50,
    description:
      'Always positive. WITHDRAW removes funds from the wallet (cash-out).',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999_999_999_999.99)
  amount: number;

  @ApiPropertyOptional({ example: 'payout_ref_99' })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
