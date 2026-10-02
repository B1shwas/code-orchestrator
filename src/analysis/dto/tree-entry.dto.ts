import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TreeEntryDto {
  @ApiProperty({ example: 'auth.service.ts' })
  name!: string;

  @ApiProperty({ example: 'src/auth/auth.service.ts' })
  path!: string;

  @ApiProperty({ enum: ['file', 'dir'] })
  type!: 'file' | 'dir';

  @ApiPropertyOptional({ example: 4096 })
  size?: number;
}
