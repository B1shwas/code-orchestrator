import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { InvestigationStatus } from '@prisma/client';
import { EvidenceBundle } from './evidence.dto';

export class InvestigationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  repositoryId!: string;

  @ApiProperty()
  query!: string;

  @ApiPropertyOptional()
  targetFile!: string | null;

  @ApiPropertyOptional()
  targetSymbol!: string | null;

  @ApiProperty({
    enum: ['PENDING', 'GATHERING_EVIDENCE', 'ANALYZING', 'COMPLETED', 'FAILED'],
  })
  status!: InvestigationStatus;

  @ApiPropertyOptional({ type: () => EvidenceBundle })
  evidence!: EvidenceBundle | null;

  @ApiPropertyOptional()
  llmResponse!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
