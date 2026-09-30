import { ApiProperty } from '@nestjs/swagger';

export class AuthUrlResponseDto {
  @ApiProperty({ example: 'https://github.com/login/oauth/authorize?...' })
  url!: string;

  @ApiProperty({
    description: 'Signed state to echo back on callback (10m TTL)',
  })
  state!: string;

  @ApiProperty({ example: '10m' })
  expiresIn!: string;
}
