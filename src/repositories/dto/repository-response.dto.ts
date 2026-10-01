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

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
