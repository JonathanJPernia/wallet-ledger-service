import { Module } from '@nestjs/common';
import { MaterializedController } from './controllers/materialized.controller';
import { MaterializedRefreshCron } from './jobs/materialized-refresh.cron';
import { MaterializedViewsRepository } from './repositories/materialized-views.repository';
import { MaterializedViewsService } from './services/materialized-views.service';

@Module({
  controllers: [MaterializedController],
  providers: [
    MaterializedViewsRepository,
    MaterializedViewsService,
    MaterializedRefreshCron,
  ],
  exports: [MaterializedViewsService],
})
export class MaterializedModule {}
