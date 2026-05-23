import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LedgerEntry, Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { WalletNotFoundException } from '../../../common/errors/financial.exceptions';
import { CreateWalletDto, isSupportedCurrency } from '../dto/create-wallet.dto';
import {
  WalletDetailDto,
  WalletDetailApiResponseDto,
} from '../dto/wallet-detail-response.dto';
import {
  WalletMovementDto,
  WalletMovementsListDto,
  WalletMovementsApiResponseDto,
} from '../dto/wallet-movement-response.dto';
import { WalletMovementsQueryDto } from '../dto/wallet-movements-query.dto';
import {
  WalletResponseDto,
  WalletResponseMapper,
} from '../dto/wallet-response.dto';
import { UnsupportedCurrencyException } from '../exceptions/wallet.exceptions';
import { WalletsRepository } from '../repositories/wallets.repository';
import { signedLedgerAmount } from '../utils/ledger-display.util';
import {
  decodeMovementCursor,
  encodeMovementCursor,
} from '../utils/movement-cursor.util';

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

  async getWalletById(walletId: string): Promise<WalletDetailApiResponseDto> {
    const wallet = await this.requireWallet(walletId);
    const ledgerBalance = await this.walletsRepository.sumLedgerBalance(walletId);
    const projection = wallet.currentBalance;
    const difference = projection.sub(ledgerBalance).abs();

    const detail: WalletDetailDto = {
      ...WalletResponseMapper.fromEntity(wallet),
      ledgerBalance: ledgerBalance.toFixed(2),
      isConsistent: difference.lte(new Prisma.Decimal('0.01')),
    };

    return buildApiResponse(detail);
  }

  async listWalletMovements(
    walletId: string,
    query: WalletMovementsQueryDto,
  ): Promise<WalletMovementsApiResponseDto> {
    await this.requireWallet(walletId);

    const limit = query.limit ?? 50;
    const decodedCursor = query.cursor
      ? decodeMovementCursor(query.cursor)
      : undefined;

    if (query.cursor && !decodedCursor) {
      throw new BadRequestException('Invalid movements cursor');
    }

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    if (startDate && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid endDate');
    }

    const rows = await this.walletsRepository.listLedgerEntries({
      walletId,
      limit: limit + 1,
      cursor: decodedCursor ?? undefined,
      startDate,
      endDate,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const movements = page.map((row) => this.toMovementDto(row));

    let nextCursor: string | undefined;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!;
      nextCursor = encodeMovementCursor({
        createdAt: last.createdAt,
        id: last.id,
      });
    }

    const payload: WalletMovementsListDto = {
      walletId,
      movements,
      count: movements.length,
      hasMore,
      nextCursor,
    };

    return buildApiResponse(payload);
  }

  private async requireWallet(walletId: string) {
    const wallet = await this.walletsRepository.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }
    return wallet;
  }

  private toMovementDto(row: LedgerEntry): WalletMovementDto {
    return {
      id: row.id,
      operationType: row.operationType,
      amount: row.amount.toFixed(2),
      signedAmount: signedLedgerAmount(row.operationType, row.amount),
      currency: row.currency,
      balanceBefore: row.balanceBefore.toFixed(2),
      balanceAfter: row.balanceAfter.toFixed(2),
      transactionGroupId: row.transactionGroupId,
      correlationId: row.correlationId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
