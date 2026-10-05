import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../analysis/analysis.service';
import { GithubService } from '../auth/github.service';
import { LLM_SERVICE } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { EvidenceBuilderService } from './evidence-builder.service';
import { InvestigationsService } from './investigations.service';

describe('InvestigationsService', () => {
  let service: InvestigationsService;
  const prisma = {
    userRepository: { findUnique: jest.fn() },
    investigation: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const evidence = { buildEvidence: jest.fn() };
  const llm = { complete: jest.fn() };
  const users = { getDecryptedGithubToken: jest.fn() };
  const github = {
    getFileHistory: jest.fn(),
    getCommitDetail: jest.fn(),
    getCommitPRs: jest.fn(),
  };
  const analysis = {
    listTree: jest.fn(),
    readFile: jest.fn(),
    readSymbol: jest.fn(),
    searchFiles: jest.fn(),
  };

  const row = {
    id: 'inv-1',
    userId: 'u1',
    repositoryId: 'r1',
    query: 'why retry?',
    targetFile: null,
    targetSymbol: null,
    status: 'PENDING',
    evidence: null,
    llmResponse: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestigationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EvidenceBuilderService, useValue: evidence },
        { provide: UsersService, useValue: users },
        { provide: GithubService, useValue: github },
        { provide: AnalysisService, useValue: analysis },
        { provide: LLM_SERVICE, useValue: llm },
      ],
    }).compile();

    service = module.get<InvestigationsService>(InvestigationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('rejects unlinked repos and non-ready repos', async () => {
      prisma.userRepository.findUnique.mockResolvedValue(null);
      await expect(
        service.create('u1', { repositoryId: 'r1', query: 'q' }),
      ).rejects.toThrow(NotFoundException);

      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { status: 'CLONING' },
      });
      await expect(
        service.create('u1', { repositoryId: 'r1', query: 'q' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.investigation.create).not.toHaveBeenCalled();
    });

    it('creates PENDING and returns immediately', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { status: 'READY' },
      });
      prisma.investigation.create.mockResolvedValue(row);
      prisma.investigation.update.mockResolvedValue(row);

      const dto = await service.create('u1', {
        repositoryId: 'r1',
        query: '  why retry?  ',
      });

      expect(dto.status).toBe('PENDING');
      expect(prisma.investigation.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          repositoryId: 'r1',
          query: 'why retry?',
          targetFile: null,
          targetSymbol: null,
          status: 'PENDING',
        },
      });
    });

    it('runs to COMPLETED in the background', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { status: 'READY' },
      });
      prisma.investigation.create.mockResolvedValue(row);
      prisma.investigation.update.mockImplementation(
        (args: { where: unknown; data: Record<string, unknown> }) =>
          Promise.resolve({ ...row, ...args.data }),
      );
      evidence.buildEvidence.mockResolvedValue({
        code: [],
        commits: [],
        diffs: [],
        prs: [],
        issues: [],
        historyNote: 'none',
      });
      llm.complete.mockResolvedValue('because reasons [repo.ts:1]');

      await service.create('u1', { repositoryId: 'r1', query: 'why?' });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const statuses = prisma.investigation.update.mock.calls.map(
        (c: unknown[]) => (c[0] as { data: { status: string } }).data.status,
      );
      expect(statuses).toEqual([
        'GATHERING_EVIDENCE',
        'ANALYZING',
        'COMPLETED',
      ]);
    });

    it('marks FAILED when evidence gathering throws', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { status: 'READY' },
      });
      prisma.investigation.create.mockResolvedValue(row);
      evidence.buildEvidence.mockRejectedValue(new Error('boom'));

      await service.create('u1', { repositoryId: 'r1', query: 'why?' });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(prisma.investigation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'FAILED' } }),
      );
    });

    it('marks FAILED when the LLM throws', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { status: 'READY' },
      });
      prisma.investigation.create.mockResolvedValue(row);
      evidence.buildEvidence.mockResolvedValue({
        code: [],
        commits: [],
        diffs: [],
        prs: [],
        issues: [],
        historyNote: null,
      });
      llm.complete.mockRejectedValue(new Error('llm down'));

      await service.create('u1', { repositoryId: 'r1', query: 'why?' });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const statuses = prisma.investigation.update.mock.calls.map(
        (c: unknown[]) => (c[0] as { data: { status: string } }).data.status,
      );
      expect(statuses).toContain('FAILED');
    });
  });

  describe('list/findOne', () => {
    it('scopes to the requesting user', async () => {
      prisma.investigation.findMany.mockResolvedValue([row]);
      prisma.investigation.findFirst.mockResolvedValue(null);

      const list = await service.list('u1', 'r1', 10);
      expect(list).toHaveLength(1);
      expect(prisma.investigation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', repositoryId: 'r1' },
        }),
      );
      await expect(service.findOne('u1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
