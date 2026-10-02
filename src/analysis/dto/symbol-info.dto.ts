import { ApiProperty } from '@nestjs/swagger';

export class SymbolInfoDto {
  @ApiProperty({ example: 'AuthService' })
  name!: string;

  @ApiProperty({ enum: ['class', 'interface', 'function', 'method', 'enum'] })
  kind!: 'class' | 'interface' | 'function' | 'method' | 'enum';

  @ApiProperty({ example: 10 })
  startLine!: number;

  @ApiProperty({ example: 135 })
  endLine!: number;
}
