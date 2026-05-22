import { Module } from '@nestjs/common';
import { WalletsController } from './controllers/wallets.controller';
import { DepositRepository } from './repositories/deposit.repository';
import { TransferRepository } from './repositories/transfer.repository';
import { WithdrawRepository } from './repositories/withdraw.repository';
import { WalletsRepository } from './repositories/wallets.repository';
import { DepositService } from './services/deposit.service';
import { TransferService } from './services/transfer.service';
import { WithdrawService } from './services/withdraw.service';
import { WalletsService } from './services/wallets.service';

@Module({
  controllers: [WalletsController],
  providers: [
    WalletsRepository,
    WalletsService,
    DepositRepository,
    DepositService,
    TransferRepository,
    TransferService,
    WithdrawRepository,
    WithdrawService,
  ],
  exports: [
    WalletsRepository,
    WalletsService,
    DepositRepository,
    DepositService,
    TransferRepository,
    TransferService,
    WithdrawRepository,
    WithdrawService,
  ],
})
export class WalletsModule {}
