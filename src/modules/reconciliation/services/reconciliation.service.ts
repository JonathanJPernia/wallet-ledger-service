import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildApiResponse,
  ApiResponseDto,
} from '../../../common/dto/api-response.dto';
import { ErrorCode } from '../../../common/errors/error-codes';
import { WalletNotFoundException } from '../../../common/errors/financial.exceptions';
import { AuditLogService } from '../../../common/observability/audit-log.service';
import { MetricsService } from '../../../common/observability/metrics.service';
import type { WalletReconciliationResultDto } from '../dto/reconciliation-response.dto';
import type { DriftReportDto } from '../dto/reconciliation-response.dto';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  classifyDriftSeverity,
  shouldAutoRepair,
  type DriftSeverity,
} from '../utils/drift-severity.util';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly reconciliationRepository: ReconciliationRepository,
    private readonly metrics: MetricsService,
    private readonly auditLog: AuditLogService,
  ) {}

  async reconcileWallet(
    walletId: string,
    options?: { strictLedger?: boolean },
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

    const { balance: ledgerBalance, dataSource } =
      await this.reconciliationRepository.resolveLedgerBalance(walletId, {
        allowMvFastPath: !options?.strictLedger,
      });

    let result = this.buildResult(
      walletId,
      ledgerBalance,
      wallet.currentBalance,
      dataSource,
    );

    if (
      !result.isConsistent &&
      result.severity &&
      shouldAutoRepair(result.severity as DriftSeverity)
    ) {
      await this.reconciliationRepository.repairProjectionToLedger(
        walletId,
        ledgerBalance,
      );
      await this.auditLog.record({
        action: 'reconciliation.auto_repair',
        entityType: 'wallet',
        entityId: walletId,
        metadata: {
          previousProjection: result.projectionBalance,
          ledgerBalance: result.ledgerBalance,
          severity: result.severity,
        },
      });
      result = {
        ...result,
        projectionBalance: result.ledgerBalance,
        difference: '0.00',
        isConsistent: true,
        autoRepaired: true,
      };
      this.logger.warn({
        event: 'reconciliation.auto_repaired',
        walletId,
        severity: result.severity,
      });
    }

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
      this.buildResult(
        row.walletId,
        row.ledgerBalance,
        row.projectionBalance,
        'ledger',
      ),
    );

    for (const drift of drifts) {
      this.logDrift(drift);
    }

    const report: DriftReportDto = {
      driftCount: drifts.length,
      drifts,
      scannedAt: new Date().toISOString(),
      severitySummary: this.summarizeSeverities(drifts),
    };

    this.logger.log({
      event: 'reconciliation.completed',
      scope: 'drift_scan',
      driftCount: drifts.length,
      severitySummary: report.severitySummary,
    });

    return buildApiResponse(report);
  }

  private buildResult(
    walletId: string,
    ledgerBalance: Prisma.Decimal,
    projectionBalance: Prisma.Decimal,
    dataSource: 'ledger' | 'mv',
  ): WalletReconciliationResultDto {
    const difference = projectionBalance.sub(ledgerBalance);
    const severity = classifyDriftSeverity(difference);
    const isConsistent = severity === 'NONE';

    const result: WalletReconciliationResultDto = {
      walletId,
      ledgerBalance: ledgerBalance.toFixed(2),
      projectionBalance: projectionBalance.toFixed(2),
      difference: difference.toFixed(2),
      isConsistent,
      severity,
      dataSource,
    };

    if (!isConsistent) {
      result.driftCode = ErrorCode.RECONCILIATION_DRIFT_DETECTED;
    }

    this.metrics.recordReconciliationDrift(severity);

    return result;
  }

  private summarizeSeverities(
    drifts: WalletReconciliationResultDto[],
  ): Record<DriftSeverity, number> {
    const summary: Record<DriftSeverity, number> = {
      NONE: 0,
      LOW: 0,
      MEDIUM: 0,
      CRITICAL: 0,
    };
    for (const d of drifts) {
      const s = (d.severity ?? 'NONE') as DriftSeverity;
      summary[s] = (summary[s] ?? 0) + 1;
    }
    return summary;
  }

  private logCompletion(result: WalletReconciliationResultDto): void {
    if (!result.isConsistent) {
      this.logDrift(result);
    }

    this.logger.log({
      event: 'reconciliation.completed',
      walletId: result.walletId,
      isConsistent: result.isConsistent,
      severity: result.severity,
      dataSource: result.dataSource,
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
      severity: result.severity,
      dataSource: result.dataSource,
      ledgerBalance: result.ledgerBalance,
      projectionBalance: result.projectionBalance,
      difference: result.difference,
    });
  }
}
