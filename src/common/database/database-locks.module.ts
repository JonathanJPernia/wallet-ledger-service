import { Global, Module } from '@nestjs/common';
import { LockResolverService } from './lock-resolver.service';

@Global()
@Module({
  providers: [LockResolverService],
  exports: [LockResolverService],
})
export class DatabaseLocksModule {}
