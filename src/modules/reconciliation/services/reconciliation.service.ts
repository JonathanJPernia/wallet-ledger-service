import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { ErrorCode } from '../../../common/errors/error-codes';
import { WalletNotFoundException } from '../../../common/errors/financial.exceptions';
import type { WalletReconciliationResultDto } from '../dto/reconciliation-response.dto';
import type { DriftReportDto } from '../dto/reconciliation-response.dto';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly reconciliationRepository: ReconciliationRepository,
  ) {}

  async reconcileWallet(
    walletId: string,
  ): Promise<ApiResponseDto<WalletReconciliationResultDto>> {
    this.logger.log({
      event: 'reconciliation.started',
      walletId,
      scope: 'single_wallet',
    });

    const wallet = await this.reconciliationRepository.findWalletById(walletId);
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }

    const ledgerBalance =
      await this.reconciliationRepository.computeLedgerBalance(walletId);

    const result = this.buildResult(
      walletId,
      ledgerBalance,
      wallet.currentBalance,
    );

    this.logCompletion(result);

    return buildApiResponse(result);
  }

  async findDrifts(): Promise<ApiResponseDto<DriftReportDto>> {
    this.logger.log({
      event: 'reconciliation.started',
      scope: 'drift_scan',
    });

    const rows = await this.reconciliationRepository.findWalletDriftRows();

    const drifts = rows.map((row) =>
      this.buildResult(row.walletId, row.ledgerBalance, row.projectionBalance),
    );

    for (const drift of drifts) {
      this.logDrift(drift);
    }

    const report: DriftReportDto = {
      driftCount: drifts.length,
      drifts,
      scannedAt: new Date().toISOString(),
    };

    this.logger.log({
      event: 'reconciliation.completed',
      scope: 'drift_scan',
      driftCount: drifts.length,
      walletCount: drifts.length,
    });

    return buildApiResponse(report);
  }

  private buildResult(
    walletId: string,
    ledgerBalance: Prisma.Decimal,
    projectionBalance: Prisma.Decimal,
  ): WalletReconciliationResultDto {
    const difference = projectionBalance.sub(ledgerBalance);
    const isConsistent = difference.eq(0);

    const result: WalletReconciliationResultDto = {
      walletId,
      ledgerBalance: ledgerBalance.toFixed(2),
      projectionBalance: projectionBalance.toFixed(2),
      difference: difference.toFixed(2),
      isConsistent,
    };

    if (!isConsistent) {
      result.driftCode = ErrorCode.RECONCILIATION_DRIFT_DETECTED;
    }

    return result;
  }

  private logCompletion(result: WalletReconciliationResultDto): void {
    if (!result.isConsistent) {
      this.logDrift(result);
    }

    this.logger.log({
      event: 'reconciliation.completed',
      walletId: result.walletId,
      isConsistent: result.isConsistent,
      ledgerBalance: result.ledgerBalance,
      projectionBalance: result.projectionBalance,
      difference: result.difference,
    });
  }

  private logDrift(result: WalletReconciliationResultDto): void {
    this.logger.warn({
      event: 'reconciliation.drift_detected',
      code: ErrorCode.RECONCILIATION_DRIFT_DETECTED,
      walletId: result.walletId,
      ledgerBalance: result.ledgerBalance,
      projectionBalance: result.projectionBalance,
      difference: result.difference,
    });
  }
}
