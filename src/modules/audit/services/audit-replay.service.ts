import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { LedgerReplayRepository } from '../../../common/ledger/ledger-replay.repository';
import type {
  SystemRebuildResponseDto,
  WalletDiffResponseDto,
  WalletReplayResponseDto,
} from '../dto/audit-response.dto';

@Injectable()
export class AuditReplayService {
  private readonly logger = new Logger(AuditReplayService.name);

  constructor(private readonly ledgerReplay: LedgerReplayRepository) {}

  async replayWallet(
    walletId: string,
    toDate: string,
  ): Promise<ApiResponseDto<WalletReplayResponseDto>> {
    const wallet = await this.ledgerReplay.findWalletProjection(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    const asOf = this.parseToDate(toDate);
    const ledgerBalance = await this.ledgerReplay.computeWalletBalanceAsOf(
      walletId,
      asOf,
    );

    this.logger.log({
      event: 'audit.wallet_replay',
      walletId,
      toDate: asOf.toISOString(),
      ledgerBalance: ledgerBalance.toFixed(2),
    });

    return buildApiResponse({
      walletId,
      toDate: asOf.toISOString(),
      currency: wallet.currency,
      ledgerBalance: ledgerBalance.toFixed(2),
      entryCountSource: 'ledger_sum',
      sourceOfTruth: 'ledger',
    });
  }

  async diffWallet(
    walletId: string,
    toDate: string,
  ): Promise<ApiResponseDto<WalletDiffResponseDto>> {
    const wallet = await this.ledgerReplay.findWalletProjection(walletId);
    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    const asOf = this.parseToDate(toDate);
    const ledgerRebuild = await this.ledgerReplay.computeWalletBalanceAsOf(
      walletId,
      asOf,
    );

    const projectionNow = wallet.currentBalance;
    const difference = projectionNow.sub(ledgerRebuild);

    return buildApiResponse({
      walletId,
      toDate: asOf.toISOString(),
      projectionBalance: projectionNow.toFixed(2),
      ledgerRebuild: ledgerRebuild.toFixed(2),
      difference: difference.toFixed(2),
      isConsistent: difference.eq(0),
      sourceOfTruth: 'ledger',
      note:
        'projectionBalance is current operational state; ledgerRebuild is sum of entries before toDate',
    });
  }

  async rebuildSystem(
    toDate: string,
    currency?: string,
  ): Promise<ApiResponseDto<SystemRebuildResponseDto>> {
    const asOf = this.parseToDate(toDate);
    const rows = await this.ledgerReplay.computeAllWalletBalancesAsOf(
      asOf,
      currency,
    );

    let total = new Prisma.Decimal(0);
    let inconsistent = 0;

    const wallets = await Promise.all(
      rows.map(async (row) => {
        const projection = await this.ledgerReplay.findWalletProjection(
          row.walletId,
        );
        const projectionBalance = projection?.currentBalance ?? new Prisma.Decimal(0);
        const diff = projectionBalance.sub(row.ledgerBalance);
        if (!diff.eq(0)) {
          inconsistent += 1;
        }
        total = total.add(row.ledgerBalance);
        return {
          walletId: row.walletId,
          currency: row.currency,
          ledgerBalance: row.ledgerBalance.toFixed(2),
          projectionBalance: projectionBalance.toFixed(2),
          difference: diff.toFixed(2),
          isConsistent: diff.eq(0),
        };
      }),
    );

    return buildApiResponse({
      toDate: asOf.toISOString(),
      currency: currency ?? 'ALL',
      totalLedgerBalance: total.toFixed(2),
      walletCount: rows.length,
      inconsistentWalletCount: inconsistent,
      wallets,
      sourceOfTruth: 'ledger',
    });
  }

  private parseToDate(toDate: string): Date {
    const asOf = new Date(toDate);
    if (Number.isNaN(asOf.getTime())) {
      throw new Error('Invalid toDate');
    }
    return asOf;
  }
}
