import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ example: 'c0f8...' })
  id!: string;

  @ApiProperty({ example: '12345678' })
  githubId!: string;

  @ApiProperty({ example: 'dev@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 'Ada Lovelace', nullable: true })
  name!: string | null;

  @ApiProperty({
    example: 'https://avatars.githubusercontent.com/u/1?v=4',
    nullable: true,
  })
  avatarUrl!: string | null;
}
