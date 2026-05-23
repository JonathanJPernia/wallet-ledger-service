import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller';
import { AuditReplayService } from './services/audit-replay.service';

@Module({
  controllers: [AuditController],
  providers: [AuditReplayService],
  exports: [AuditReplayService],
})
export class AuditModule {}
