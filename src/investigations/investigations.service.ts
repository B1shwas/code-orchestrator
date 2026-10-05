import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Investigation } from '@prisma/client';
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
    llmResponse: row.llmResponse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
      await this.prisma.investigation.update({
        where: { id: investigationId },
        data: { status: 'COMPLETED', llmResponse: answer },
      });
    } catch (err) {
      this.logger.error(
        `Investigation ${investigationId} failed: ${(err as Error).message}`,
      );
      await this.prisma.investigation
        .update({ where: { id: investigationId }, data: { status: 'FAILED' } })
        .catch(() => {});
    }
  }
}
