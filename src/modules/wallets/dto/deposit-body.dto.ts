import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
} from 'class-validator';

export class DepositBodyDto {
  @ApiProperty({
    example: 100,
    description: 'Always positive. Sign is defined by operationType DEPOSIT.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(999_999_999_999.99)
  amount: number;

  @ApiPropertyOptional({
    example: 'invoice_9f2',
    description: 'Optional external reference (invoice, payment id, etc.)',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;
}
