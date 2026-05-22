import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  DriftReportApiResponseDto,
  WalletReconciliationApiResponseDto,
} from '../dto/reconciliation-response.dto';
import { ReconciliationService } from '../services/reconciliation.service';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('drift')
  @ApiOperation({
    summary: 'List wallets with ledger/projection drift',
    description:
      'Returns only inconsistent wallets. Wallets without ledger entries expect ledgerBalance 0.',
  })
  @ApiOkResponse({
    description: 'Drift report',
    type: DriftReportApiResponseDto,
  })
  findDrifts(): Promise<DriftReportApiResponseDto> {
    return this.reconciliationService.findDrifts();
  }

  @Get('wallets/:walletId')
  @ApiOperation({
    summary: 'Reconcile wallet projection vs ledger',
    description:
      'Read-only integrity check. Ledger is source of truth; never mutates balances.',
  })
  @ApiOkResponse({
    description: 'Reconciliation result',
    type: WalletReconciliationApiResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Wallet not found' })
  reconcileWallet(
    @Param('walletId', ParseUUIDPipe) walletId: string,
  ): Promise<WalletReconciliationApiResponseDto> {
    return this.reconciliationService.reconcileWallet(walletId);
  }
}
