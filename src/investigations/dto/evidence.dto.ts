import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CodeEvidence {
  @ApiProperty({ example: 'src/auth/auth.service.ts' })
  file!: string;

  @ApiProperty({ example: 42 })
  startLine!: number;

  @ApiProperty({ example: 95 })
  endLine!: number;

  @ApiProperty({ example: '  async loginWithGithub(code: string,' })
  content!: string;

  @ApiPropertyOptional({
    example: 'AuthService.loginWithGithub',
    description: 'Symbol this excerpt was read for, when known',
  })
  symbol?: string | null;
}

export class CommitEvidence {
  @ApiProperty({ example: '8a91f2c4d2e1a0b3f5c6d7e8f9a0b1c2d3e4f5a' })
  sha!: string;

  @ApiProperty({ example: 'fix: limit payment retries to 2' })
  message!: string;

  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  author?: string | null;

  @ApiPropertyOptional({ example: '2026-09-18T10:00:00Z' })
  date?: string | null;
}

export class DiffEvidence {
  @ApiProperty({ example: '8a91f2c4d2e1a0b3f5c6d7e8f9a0b1c2d3e4f5a' })
  sha!: string;

  @ApiProperty({ example: 'src/payments/retry.ts' })
  file!: string;

  @ApiProperty({ example: '@@ -10,7 +10,7 @@\n- while (true)\n+ for (' })
  patch!: string;
}

export class PREvidence {
  @ApiProperty({ example: 142 })
  number!: number;

  @ApiProperty({ example: 'fix: limit payment retries' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Provider returns transient 503s. Fixes #141.',
  })
  body?: string | null;
}

export class IssueEvidence {
  @ApiProperty({ example: 141 })
  number!: number;

  @ApiProperty({ example: 'Duplicate charges during provider outage' })
  title!: string;

  @ApiPropertyOptional({ example: 'During the outage...' })
  body?: string | null;
}

export class EvidenceBundle {
  @ApiProperty({ type: [CodeEvidence] })
  code!: CodeEvidence[];

  @ApiProperty({ type: [CommitEvidence] })
  commits!: CommitEvidence[];

  @ApiProperty({ type: [DiffEvidence] })
  diffs!: DiffEvidence[];

  @ApiProperty({ type: [PREvidence] })
  prs!: PREvidence[];

  @ApiProperty({ type: [IssueEvidence] })
  issues!: IssueEvidence[];

  @ApiPropertyOptional({
    example: 'No relevant commits found in file history.',
    description:
      'Set when history lookup yielded nothing — the honest-degradation marker. Absent sections mean “no data”, never failure.',
  })
  historyNote?: string | null;
}
