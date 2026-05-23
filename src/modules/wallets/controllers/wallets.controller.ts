import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
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
import { WithdrawBodyDto } from '../dto/withdraw-body.dto';
import { WithdrawApiResponseDto } from '../dto/withdraw-response.dto';
import { WalletDetailApiResponseDto } from '../dto/wallet-detail-response.dto';
import { WalletMovementsApiResponseDto } from '../dto/wallet-movement-response.dto';
import { WalletMovementsQueryDto } from '../dto/wallet-movements-query.dto';
import { WalletApiResponseDto } from '../dto/wallet-response.dto';
import { IdempotencyKeyRequiredException } from '../exceptions/deposit.exceptions';
import { DepositService } from '../services/deposit.service';
import { TransferService } from '../services/transfer.service';
import { WithdrawService } from '../services/withdraw.service';
import { WalletsService } from '../services/wallets.service';
import { buildRequestHash } from '../utils/request-hash.util';

@ApiTags('wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly depositService: DepositService,
    private readonly transferService: TransferService,
    private readonly withdrawService: WithdrawService,
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

  @Get(':id/movements')
  @ApiOperation({
    summary: 'List wallet ledger movements',
    description:
      'Historical movements from the append-only ledger (newest first). Paginate with meta.nextCursor.',
  })
  @ApiOkResponse({
    description: 'Ledger movements page',
    type: WalletMovementsApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  listMovements(
    @Param('id', ParseUUIDPipe) walletId: string,
    @Query() query: WalletMovementsQueryDto,
  ): Promise<WalletMovementsApiResponseDto> {
    return this.walletsService.listWalletMovements(walletId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get wallet by id',
    description:
      'Current balance (projection), ledger balance, and consistency flag.',
  })
  @ApiOkResponse({
    description: 'Wallet details',
    type: WalletDetailApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  getById(
    @Param('id', ParseUUIDPipe) walletId: string,
  ): Promise<WalletDetailApiResponseDto> {
    return this.walletsService.getWalletById(walletId);
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

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Withdraw funds (cash-out)',
    description:
      'Outbound ACID withdraw: Serializable TX, FOR UPDATE lock, ledger WITHDRAW, idempotent. Money leaves the wallet.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique key per logical withdraw (retry-safe)',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'Withdraw completed',
    type: WithdrawApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid amount, insufficient funds, or wallet not active',
  })
  @ApiConflictResponse({
    description: 'Idempotency conflict or concurrency conflict',
  })
  withdraw(
    @Param('id', ParseUUIDPipe) walletId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: WithdrawBodyDto,
    @Req() req: Request,
  ): Promise<WithdrawApiResponseDto> {
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

    return this.withdrawService.withdrawFromHttp(
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
