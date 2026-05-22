import { Injectable, Logger } from '@nestjs/common';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { CreateWalletDto, isSupportedCurrency } from '../dto/create-wallet.dto';
import {
  WalletResponseDto,
  WalletResponseMapper,
} from '../dto/wallet-response.dto';
import { UnsupportedCurrencyException } from '../exceptions/wallet.exceptions';
import { WalletsRepository } from '../repositories/wallets.repository';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(private readonly walletsRepository: WalletsRepository) {}

  async createWallet(
    dto: CreateWalletDto,
  ): Promise<ApiResponseDto<WalletResponseDto>> {
    const currency = dto.currency.toUpperCase();

    this.logger.log({
      event: 'wallet.create.started',
      currency,
    });

    if (!isSupportedCurrency(currency)) {
      throw new UnsupportedCurrencyException(currency);
    }

    const wallet = await this.walletsRepository.create({ currency });

    const response = buildApiResponse(WalletResponseMapper.fromEntity(wallet));

    this.logger.log({
      event: 'wallet.create.completed',
      walletId: wallet.id,
      currency: wallet.currency,
      status: wallet.status,
      version: wallet.version,
    });

    return response;
  }
}
