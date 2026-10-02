import { ApiProperty } from '@nestjs/swagger';

export class FileContentDto {
  @ApiProperty({ example: 'src/auth/auth.service.ts' })
  path!: string;

  @ApiProperty({ example: 4096 })
  size!: number;

  @ApiProperty({ example: false })
  truncated!: boolean;

  @ApiProperty({ example: false })
  binary!: boolean;

  @ApiProperty({ example: 'import { Injectable } ...', nullable: true })
  content!: string | null;
}
