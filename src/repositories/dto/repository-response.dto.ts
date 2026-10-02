import { ApiProperty } from '@nestjs/swagger';
import type { RepoStatus } from '@prisma/client';

export class RepositoryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'octocat' })
  owner!: string;

  @ApiProperty({ example: 'hello-world' })
  name!: string;

  @ApiProperty({ example: 'main' })
  defaultBranch!: string;

  @ApiProperty({ enum: ['PENDING', 'CLONING', 'READY', 'ERROR'] })
  status!: RepoStatus;

  @ApiProperty({ example: 'cloning', nullable: true })
  stage!: string | null;

  @ApiProperty({ example: 68, nullable: true })
  progress!: number | null;

  @ApiProperty({ example: 44892160, nullable: true })
  sizeBytes!: number | null;

  @ApiProperty({ example: 48 })
  investigationCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
