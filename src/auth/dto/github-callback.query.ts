import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GithubCallbackQueryDto {
  @ApiProperty({ description: 'OAuth code from GitHub redirect' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Signed state returned by GET /auth/github' })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @ApiProperty({
    description: 'Issuer identifier appended by GitHub; ignored',
    required: false,
  })
  @IsOptional()
  @IsString()
  iss?: string;
}
