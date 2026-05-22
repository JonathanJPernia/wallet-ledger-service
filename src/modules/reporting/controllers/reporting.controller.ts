import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  RebuildWalletApiResponseDto,
  SystemAnalyticsApiResponseDto,
  WalletAnalyticsApiResponseDto,
} from '../dto/analytics-response.dto';
import { PnlApiResponseDto } from '../dto/pnl-response.dto';
import { ReportingRangeQueryDto } from '../dto/reporting-query.dto';
import {
  SnapshotApiResponseDto,
  SnapshotListApiResponseDto,
} from '../dto/snapshot-response.dto';
import { FinancialExportService } from '../services/financial-export.service';
import { LedgerAnalyticsService } from '../services/ledger-analytics.service';
import { PnlService } from '../services/pnl.service';
import { SnapshotService } from '../services/snapshot.service';

@ApiTags('reporting')
@Controller('reporting')
export class ReportingController {
  constructor(
    private readonly pnlService: PnlService,
    private readonly ledgerAnalyticsService: LedgerAnalyticsService,
    private readonly snapshotService: SnapshotService,
    private readonly financialExportService: FinancialExportService,
  ) {}

  @Get('pnl')
  @ApiOperation({
    summary: 'Profit & Loss (fee revenue only)',
    description: 'Read-only. Revenue = FEE_IN ledger entries. Ledger is source of truth.',
  })
  @ApiOkResponse({ type: PnlApiResponseDto })
  getPnl(@Query() query: ReportingRangeQueryDto) {
    return this.pnlService.getPnl({
      period: query.period ?? 'daily',
      startDate: query.startDate,
      endDate: query.endDate,
      currency: query.currency,
    });
  }

  @Get('analytics/system')
  @ApiOperation({ summary: 'System-wide ledger analytics' })
  @ApiOkResponse({ type: SystemAnalyticsApiResponseDto })
  getSystemAnalytics(@Query() query: ReportingRangeQueryDto) {
    return this.ledgerAnalyticsService.getSystemAnalytics(query);
  }

  @Get('analytics/wallets/:walletId')
  @ApiOperation({ summary: 'Per-wallet activity from ledger' })
  @ApiOkResponse({ type: WalletAnalyticsApiResponseDto })
  getWalletAnalytics(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query() query: ReportingRangeQueryDto,
  ) {
    return this.ledgerAnalyticsService.getWalletAnalytics(walletId, query);
  }

  @Get('audit/wallets/:walletId/rebuild')
  @ApiOperation({
    summary: 'Replay ledger balance as-of date vs projection',
    description: 'Forensic audit. Reporting always trusts ledger.',
  })
  @ApiOkResponse({ type: RebuildWalletApiResponseDto })
  rebuildWallet(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('toDate') toDate: string,
  ) {
    return this.ledgerAnalyticsService.rebuildWallet(
      walletId,
      toDate ?? new Date().toISOString(),
    );
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List immutable daily financial snapshots' })
  @ApiOkResponse({ type: SnapshotListApiResponseDto })
  listSnapshots(@Query() query: ReportingRangeQueryDto) {
    return this.snapshotService.listSnapshots({
      from: query.startDate,
      to: query.endDate,
      currency: query.currency,
    });
  }

  @Post('snapshots/run')
  @ApiOperation({ summary: 'Trigger daily snapshot manually (UTC closing day)' })
  @ApiOkResponse({ type: SnapshotApiResponseDto })
  runSnapshot(@Query() query: ReportingRangeQueryDto) {
    return this.snapshotService.triggerManualSnapshot(
      query.startDate,
      query.currency,
    );
  }

  @Get('exports/wallets/:walletId/ledger.csv')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export wallet ledger as CSV' })
  exportWalletLedger(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query() query: ReportingRangeQueryDto,
  ) {
    return this.financialExportService.exportWalletLedgerCsv(walletId, {
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('exports/revenue.csv')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export system fee revenue as CSV' })
  exportRevenue(@Query() query: ReportingRangeQueryDto) {
    return this.financialExportService.exportRevenueCsv(query);
  }

  @Get('exports/reconciliation.csv')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export reconciliation drift report as CSV' })
  exportReconciliation() {
    return this.financialExportService.exportReconciliationCsv();
  }
}
