import { Global, Module } from '@nestjs/common';
import { FeesRepository } from './fees.repository';
import { FeesService } from './fees.service';
import { SystemFeeWalletService } from './system-fee-wallet.service';

@Global()
@Module({
  providers: [FeesRepository, FeesService, SystemFeeWalletService],
  exports: [FeesService, SystemFeeWalletService, FeesRepository],
})
export class FeesModule {}
