import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaterializedViewsService } from '../services/materialized-views.service';

@ApiTags('materialized')
@Controller('materialized')
export class MaterializedController {
  constructor(
    private readonly materializedViewsService: MaterializedViewsService,
  ) {}

  @Post('refresh')
  @ApiOperation({ summary: 'Manual refresh of today materialized buckets' })
  async refresh() {
    await this.materializedViewsService.refreshTodayBuckets();
    return { status: 'REFRESHED' };
  }
}
