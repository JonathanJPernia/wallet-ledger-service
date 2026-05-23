import { Global, Module } from '@nestjs/common';
import { EventsController } from './controllers/events.controller';
import { OutboxDispatchCron } from './jobs/outbox-dispatch.cron';
import { EventsRepository } from './repositories/events.repository';
import { OutboxRepository } from './repositories/outbox.repository';
import { FinancialEventsService } from './services/financial-events.service';
import { OutboxDispatchService } from './services/outbox-dispatch.service';

@Global()
@Module({
  controllers: [EventsController],
  providers: [
    EventsRepository,
    OutboxRepository,
    FinancialEventsService,
    OutboxDispatchService,
    OutboxDispatchCron,
  ],
  exports: [FinancialEventsService, EventsRepository, OutboxDispatchService],
})
export class EventsModule {}
