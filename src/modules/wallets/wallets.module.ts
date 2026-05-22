import { Module } from '@nestjs/common';
import { WalletsController } from './controllers/wallets.controller';
import { DepositRepository } from './repositories/deposit.repository';
import { TransferRepository } from './repositories/transfer.repository';
import { WalletsRepository } from './repositories/wallets.repository';
import { DepositService } from './services/deposit.service';
import { TransferService } from './services/transfer.service';
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
  ],
  exports: [
    WalletsRepository,
    WalletsService,
    DepositRepository,
    DepositService,
    TransferRepository,
    TransferService,
  ],
})
export class WalletsModule {}
