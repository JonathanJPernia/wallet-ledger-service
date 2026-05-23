import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxDispatchService } from '../services/outbox-dispatch.service';

@Injectable()
export class OutboxDispatchCron {
  private readonly logger = new Logger(OutboxDispatchCron.name);

  constructor(private readonly dispatchService: OutboxDispatchService) {}

  @Cron('*/10 * * * * *')
  async run(): Promise<void> {
    const result = await this.dispatchService.dispatchPending();
    if (result.delivered + result.retried + result.dlq > 0) {
      this.logger.log({
        event: 'events.outbox_dispatch_tick',
        ...result,
      });
    }
  }
}
