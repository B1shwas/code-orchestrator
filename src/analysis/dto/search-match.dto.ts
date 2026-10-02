import { ApiProperty } from '@nestjs/swagger';

export class SearchMatchDto {
  @ApiProperty({ example: 'src/auth/auth.service.ts' })
  file!: string;

  @ApiProperty({ example: 42 })
  line!: number;

  @ApiProperty({ example: 10 })
  column!: number;

  @ApiProperty({ example: '  async loginWithGithub(code: string,' })
  preview!: string;
}
