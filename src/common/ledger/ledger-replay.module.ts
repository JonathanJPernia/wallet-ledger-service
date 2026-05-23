import { Global, Module } from '@nestjs/common';
import { LedgerReplayRepository } from './ledger-replay.repository';

@Global()
@Module({
  providers: [LedgerReplayRepository],
  exports: [LedgerReplayRepository],
})
export class LedgerReplayModule {}
