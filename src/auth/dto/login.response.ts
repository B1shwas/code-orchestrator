import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from '../../users/dto/user-profile.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'App JWT to use as Authorization: Bearer <token>',
  })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: '7d' })
  expiresIn!: string;

  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}
