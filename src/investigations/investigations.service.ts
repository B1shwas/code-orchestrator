import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  EvidenceGrade,
  EvidenceKind,
  Investigation,
  StepKind,
} from '@prisma/client';
import { LLM_SERVICE, LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { EvidenceBuilderService } from './evidence-builder.service';
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { EvidenceBundle } from './dto/evidence.dto';
import { InvestigationResponseDto } from './dto/investigation-response.dto';
import { buildInvestigationPrompt } from './prompts/investigate.prompt';
import { UsersService } from '../users/users.service';
import { GithubService } from '../auth/github.service';
import { AnalysisService } from '../analysis/analysis.service';
import { createTools } from './agent/tools';
import { runAgentLoop } from './agent/runner';

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

function toResponse(row: Investigation): InvestigationResponseDto {
  return {
    id: row.id,
    repositoryId: row.repositoryId,
    query: row.query,
    targetFile: row.targetFile,
    targetSymbol: row.targetSymbol,
    status: row.status,
    evidence: (row.evidence ?? null) as unknown as EvidenceBundle | null,
    result: (row.result ?? null) as unknown as Record<string, unknown> | null,
    llmResponse: row.llmResponse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type ProvisionalItem = {
  kind: EvidenceKind;
  ref: string;
  excerpt: string;
  grade: EvidenceGrade;
};

// Itemizes the bundle with provisional 'supported' grades — real grading
// arrives with the verifier (Phase 1.4); until then every row is a claim
// awaiting verification, never a verdict.
export function buildProvisionalItems(
  bundle: EvidenceBundle,
): ProvisionalItem[] {
  const items: ProvisionalItem[] = [];
  for (const c of bundle.code) {
    items.push({
      kind: 'code',
      ref: `${c.file}:${c.startLine}`,
      excerpt: c.content,
      grade: 'supported',
    });
  }
  for (const c of bundle.commits) {
    items.push({
      kind: 'commit',
      ref: c.sha,
      excerpt: c.message,
      grade: 'supported',
    });
  }
  for (const d of bundle.diffs) {
    items.push({
      kind: 'diff',
      ref: `${d.sha}:${d.file}`,
      excerpt: d.patch,
      grade: 'supported',
    });
  }
  for (const p of bundle.prs) {
    items.push({
      kind: 'pr',
      ref: `#${p.number}`,
      excerpt: `${p.title}\n${p.body ?? ''}`,
      grade: 'supported',
    });
  }
  for (const i of bundle.issues) {
    items.push({
      kind: 'issue',
      ref: `#${i.number}`,
      excerpt: `${i.title}\n${i.body ?? ''}`,
      grade: 'supported',
    });
  }
  return items;
}

@Injectable()
export class InvestigationsService {
  private readonly logger = new Logger(InvestigationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceBuilderService,
    private readonly users: UsersService,
    private readonly github: GithubService,
    private readonly analysis: AnalysisService,
    @Inject(LLM_SERVICE) private readonly llm: LlmService,
  ) {}

  async create(
    userId: string,
    dto: CreateInvestigationDto,
  ): Promise<InvestigationResponseDto> {
    const link = await this.prisma.userRepository.findUnique({
      where: {
        userId_repositoryId: { userId, repositoryId: dto.repositoryId },
      },
      include: { repository: true },
    });
    if (!link) throw new NotFoundException('Repository not found');
    if (link.repository.status !== 'READY') {
      throw new ConflictException('Repository is not ready yet');
    }

    const row = await this.prisma.investigation.create({
      data: {
        userId,
        repositoryId: dto.repositoryId,
        query: dto.query.trim(),
        targetFile: dto.targetFile?.trim() || null,
        targetSymbol: dto.targetSymbol?.trim() || null,
        status: 'PENDING',
      },
    });
    void this.run(row.id).catch(() => {});
    return toResponse(row);
  }

  async list(
    userId: string,
    repositoryId?: string,
    limit = DEFAULT_LIST_LIMIT,
  ): Promise<InvestigationResponseDto[]> {
    const rows = await this.prisma.investigation.findMany({
      where: repositoryId ? { userId, repositoryId } : { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), MAX_LIST_LIMIT),
    });
    return rows.map(toResponse);
  }

  async findOne(
    userId: string,
    investigationId: string,
  ): Promise<InvestigationResponseDto> {
    const row = await this.prisma.investigation.findFirst({
      where: { id: investigationId, userId },
    });
    if (!row) throw new NotFoundException('Investigation not found');
    return toResponse(row);
  }

  private async appendStep(
    investigationId: string,
    kind: StepKind,
    payload: unknown,
  ): Promise<void> {
    const count = await this.prisma.investigationStep.count({
      where: { investigationId },
    });
    await this.prisma.investigationStep.create({
      data: {
        investigationId,
        seq: count,
        kind,
        payload: payload as never,
      },
    });
  }

  private async saveEvidenceItems(
    investigationId: string,
    items: ProvisionalItem[],
  ): Promise<void> {
    if (items.length === 0) return;
    await this.prisma.evidenceItem.createMany({
      data: items.map((i) => ({
        investigationId,
        kind: i.kind,
        ref: i.ref,
        excerpt: i.excerpt.slice(0, 500),
        grade: i.grade,
      })),
    });
  }

  private async run(investigationId: string): Promise<void> {
    try {
      const gathering = await this.prisma.investigation.update({
        where: { id: investigationId },
        data: { status: 'GATHERING_EVIDENCE' },
      });
      const bundle = await this.evidence.buildEvidence(
        gathering.userId,
        gathering.repositoryId,
        gathering.query,
        {
          targetFile: gathering.targetFile ?? undefined,
          targetSymbol: gathering.targetSymbol ?? undefined,
        },
      );
      await this.prisma.investigation.update({
        where: { id: investigationId },
        data: { status: 'ANALYZING', evidence: bundle as never },
      });
      await this.saveEvidenceItems(
        investigationId,
        buildProvisionalItems(bundle),
      );
      await this.appendStep(investigationId, 'prompt', {
        query: gathering.query,
        promptVersion: 1,
      });

      const tools = createTools({
        prisma: this.prisma,
        users: this.users,
        github: this.github,
        analysis: this.analysis,
      });

      const { answer, verdict } = await runAgentLoop(
        this.llm,
        tools,
        {
          userId: gathering.userId,
          repositoryId: gathering.repositoryId,
        },
        buildInvestigationPrompt(gathering.query, bundle),
      );
      this.logger.warn(`investigation ${investigationId} verdict=${verdict}`);
      await this.appendStep(investigationId, 'status', {
        status: 'COMPLETED',
        verdict,
      });
      await this.prisma.investigation.update({
        where: { id: investigationId },
        data: { status: 'COMPLETED', llmResponse: answer },
      });
    } catch (err) {
      this.logger.error(
        `Investigation ${investigationId} failed: ${(err as Error).message}`,
      );
      await this.appendStep(investigationId, 'status', {
        status: 'FAILED',
      }).catch(() => {});
      await this.prisma.investigation
        .update({ where: { id: investigationId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  }
}
