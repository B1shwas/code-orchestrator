import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateInvestigationDto {
  @ApiProperty({ example: 'c0f8a1b2-...' })
  @IsUUID()
  repositoryId!: string;

  @ApiProperty({ example: 'Why does retryPayment retry only twice?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  query!: string;

  @ApiPropertyOptional({ example: 'src/payments/retry.ts' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetFile?: string;

  @ApiPropertyOptional({ example: 'Repo.retryPayment' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  targetSymbol?: string;
}
