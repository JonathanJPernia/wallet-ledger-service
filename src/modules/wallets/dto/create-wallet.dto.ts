import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'MXN'] as const;

export class CreateWalletDto {
  @ApiProperty({
    example: 'USD',
    description: 'ISO 4217 currency code (3 letters)',
    enum: SUPPORTED_CURRENCIES,
  })
  @IsString()
  @Length(3, 3, { message: 'currency must be exactly 3 characters (ISO 4217)' })
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'currency must contain only letters',
  })
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  currency: string;
}

export function isSupportedCurrency(currency: string): boolean {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency);
}
