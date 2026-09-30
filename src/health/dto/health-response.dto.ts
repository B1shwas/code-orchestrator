import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: '2026-09-30T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 'development' })
  env!: string;

  @ApiProperty({ example: 12.34, description: 'Process uptime in seconds' })
  uptime!: number;
}
