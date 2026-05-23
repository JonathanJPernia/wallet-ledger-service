import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FinancialEventsService } from '../services/financial-events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: FinancialEventsService) {}

  @Get('wallets/:walletId')
  @ApiOperation({ summary: 'List financial events for wallet' })
  listWalletEvents(
    @Param('walletId', ParseUUIDPipe) walletId: string,
    @Query('limit') limit?: string,
  ) {
    return this.eventsService.listWalletEvents(
      walletId,
      limit ? Number(limit) : 50,
    );
  }
}
