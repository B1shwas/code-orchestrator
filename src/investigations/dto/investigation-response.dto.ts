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
    enum: [
      'PENDING',
      'GATHERING_EVIDENCE',
      'ANALYZING',
      'COMPLETED',
      'PARTIAL',
      'INSUFFICIENT',
      'FAILED',
    ],
  })
  status!: InvestigationStatus;

  @ApiPropertyOptional({ type: () => EvidenceBundle })
  evidence!: EvidenceBundle | null;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Graded contract result (Why/Change shape), set on terminal runs',
  })
  result!: Record<string, unknown> | null;

  @ApiPropertyOptional()
  llmResponse!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
