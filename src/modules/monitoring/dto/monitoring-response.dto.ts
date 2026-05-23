import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from '../../../common/dto/api-response.dto';

export class LiveMonitoringResponseDto {
  @ApiProperty()
  currency: string;

  @ApiProperty()
  systemFeesPerMinute: string;

  @ApiProperty()
  systemFeesPerHour: string;

  @ApiProperty()
  activeWallets1h: number;

  @ApiProperty()
  transferEvents1h: number;

  @ApiProperty()
  suspiciousEvents: number;

  @ApiProperty({ type: [String] })
  anomalyFlags: string[];

  @ApiProperty()
  observedAt: string;
}

export class LiveMonitoringApiResponseDto extends ApiResponseDto<LiveMonitoringResponseDto> {
  @ApiProperty({ type: LiveMonitoringResponseDto })
  declare data: LiveMonitoringResponseDto;
}
