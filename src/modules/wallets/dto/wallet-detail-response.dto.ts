import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';
import { WalletResponseDto } from './wallet-response.dto';

export class WalletDetailDto extends WalletResponseDto {
  @ApiProperty({
    example: '949.50',
    description: 'Balance from ledger SUM (source of truth)',
  })
  ledgerBalance: string;

  @ApiProperty({
    example: true,
    description: 'Whether projection matches ledger',
  })
  isConsistent: boolean;
}

export class WalletDetailApiResponseDto extends ApiResponseDto<WalletDetailDto> {
  @ApiProperty({ type: WalletDetailDto })
  declare data: WalletDetailDto;
}
