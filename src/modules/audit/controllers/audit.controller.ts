import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  SystemRebuildApiResponseDto,
  WalletDiffApiResponseDto,
  WalletReplayApiResponseDto,
} from '../dto/audit-response.dto';
import { AuditReplayService } from '../services/audit-replay.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditReplayService: AuditReplayService) {}

  @Get('replay/wallets/:walletId')
  @ApiOperation({ summary: 'Time-travel wallet balance from ledger' })
  @ApiOkResponse({ type: WalletReplayApiResponseDto })
  replayWallet(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('toDate') toDate: string,
  ) {
    return this.auditReplayService.replayWallet(
      walletId,
      toDate ?? new Date().toISOString(),
    );
  }

  @Get('wallets/:walletId/diff')
  @ApiOperation({ summary: 'Diff ledger rebuild vs projection' })
  @ApiOkResponse({ type: WalletDiffApiResponseDto })
  diffWallet(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('toDate') toDate: string,
  ) {
    return this.auditReplayService.diffWallet(
      walletId,
      toDate ?? new Date().toISOString(),
    );
  }

  @Get('system/rebuild')
  @ApiOperation({ summary: 'Rebuild all wallet balances from ledger as-of date' })
  @ApiOkResponse({ type: SystemRebuildApiResponseDto })
  rebuildSystem(
    @Query('toDate') toDate: string,
    @Query('currency') currency?: string,
  ) {
    return this.auditReplayService.rebuildSystem(
      toDate ?? new Date().toISOString(),
      currency,
    );
  }
}
