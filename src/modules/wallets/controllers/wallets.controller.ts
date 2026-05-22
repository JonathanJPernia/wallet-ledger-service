import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CORRELATION_ID_HEADER } from '../../../common/interceptors/correlation-id.interceptor';
import { DepositBodyDto } from '../dto/deposit-body.dto';
import { DepositApiResponseDto } from '../dto/deposit-response.dto';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { TransferBodyDto } from '../dto/transfer-body.dto';
import { TransferApiResponseDto } from '../dto/transfer-response.dto';
import { WalletApiResponseDto } from '../dto/wallet-response.dto';
import { IdempotencyKeyRequiredException } from '../exceptions/deposit.exceptions';
import { DepositService } from '../services/deposit.service';
import { TransferService } from '../services/transfer.service';
import { WalletsService } from '../services/wallets.service';
import { buildRequestHash } from '../utils/request-hash.util';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly depositService: DepositService,
    private readonly transferService: TransferService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create wallet',
    description:
      'Creates a new wallet with zero balance, ACTIVE status, and version 1. Prepared for ledger operations.',
  })
  @ApiCreatedResponse({
    description: 'Wallet created successfully',
    type: WalletApiResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'Validation error or unsupported currency',
  })
  create(@Body() dto: CreateWalletDto): Promise<WalletApiResponseDto> {
    return this.walletsService.createWallet(dto);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Transfer funds between wallets',
    description:
      'Atomic A→B transfer: Serializable TX, ordered FOR UPDATE locks, double-entry ledger (TRANSFER_OUT + TRANSFER_IN), idempotent.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key per logical transfer (retry-safe)',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Transfer completed',
    type: TransferApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  @ApiUnprocessableEntityResponse({
    description:
      'Invalid amount, insufficient funds, same wallet, inactive wallet, or currency mismatch',
  })
  @ApiConflictResponse({
    description: 'Idempotency conflict or concurrency conflict',
  })
  transfer(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: TransferBodyDto,
    @Req() req: Request,
  ): Promise<TransferApiResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw new IdempotencyKeyRequiredException();
    }

    const correlationId = req.headers[CORRELATION_ID_HEADER] as
      | string
      | undefined;

    const requestHash = buildRequestHash([
      req.method,
      req.path,
      JSON.stringify(body),
    ]);

    return this.transferService.transferFromHttp(body, idempotencyKey.trim(), {
      method: req.method,
      path: req.path,
      requestHash,
      correlationId,
    });
  }

  @Post(':id/deposit')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Deposit funds',
    description:
      'ACID deposit: Serializable TX, FOR UPDATE lock, ledger append-only, TransactionGroup, idempotent via Idempotency-Key header.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key per logical deposit (retry-safe)',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Deposit completed',
    type: DepositApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid amount or wallet not active',
  })
  @ApiConflictResponse({
    description: 'Idempotency conflict or concurrency conflict',
  })
  deposit(
    @Param('id', ParseUUIDPipe) walletId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: DepositBodyDto,
    @Req() req: Request,
  ): Promise<DepositApiResponseDto> {
    if (!idempotencyKey?.trim()) {
      throw new IdempotencyKeyRequiredException();
    }

    const correlationId = req.headers[CORRELATION_ID_HEADER] as
      | string
      | undefined;

    const requestHash = buildRequestHash([
      req.method,
      req.path,
      walletId,
      JSON.stringify(body),
    ]);

    return this.depositService.depositFromHttp(
      walletId,
      body,
      idempotencyKey.trim(),
      {
        method: req.method,
        path: req.path,
        requestHash,
        correlationId,
      },
    );
  }
}
