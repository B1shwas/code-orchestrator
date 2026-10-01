import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ConnectRepositoryDto {
  @ApiProperty({ example: 'octocat' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'owner contains invalid characters',
  })
  owner!: string;

  @ApiProperty({ example: 'hello-world' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'name contains invalid characters',
  })
  name!: string;
}
