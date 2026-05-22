import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseMetaDto {
  @ApiProperty({ example: '2026-05-22T12:00:00.000Z' })
  timestamp: string;
}

export class ApiResponseDto<T> {
  data: T;

  @ApiProperty({ type: ApiResponseMetaDto })
  meta: ApiResponseMetaDto;
}

export function buildApiResponse<T>(data: T): ApiResponseDto<T> {
  return {
    data,
    meta: { timestamp: new Date().toISOString() },
  };
}
