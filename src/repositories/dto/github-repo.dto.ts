import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class GithubRepoDto {
  @ApiProperty({ example: 1296269 })
  @IsInt()
  githubRepoId!: number;

  @ApiProperty({ example: 'octocat' })
  @IsString()
  owner!: string;

  @ApiProperty({ example: 'hello-world' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  private?: boolean;

  @ApiPropertyOptional({ example: 'main' })
  @IsOptional()
  @IsString()
  defaultBranch?: string | null;
}
