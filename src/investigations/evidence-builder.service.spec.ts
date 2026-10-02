import { Test, TestingModule } from '@nestjs/testing';
import { GithubService } from '../auth/github.service';
import { UsersService } from '../users/users.service';
import { AnalysisService } from '../analysis/analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EvidenceBuilderService,
  fuzzyMatch,
  levenshtein,
  tokenizeQuestion,
} from './evidence-builder.service';

describe('tokenizeQuestion', () => {
  it('lowercases, splits and drops stopwords', () => {
    expect(tokenizeQuestion('Why does retryPayment retry twice?')).toEqual([
      'retrypayment',
      'retry',
      'twice',
    ]);
  });

  it('handles empty input', () => {
    expect(tokenizeQuestion('')).toEqual([]);
    expect(tokenizeQuestion('a an the')).toEqual([]);
  });
});

describe('levenshtein/fuzzyMatch', () => {
  it('measures edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });

  it('recovers typos against symbol names', () => {
    expect(fuzzyMatch('retrrrpayment', 'Repo.retryPayment')).toBe(true);
    expect(fuzzyMatch('retry', 'Repo.retryPayment')).toBe(true);
    expect(fuzzyMatch('unrelated', 'Repo.retryPayment')).toBe(false);
  });
});

describe('EvidenceBuilderService', () => {
  let service: EvidenceBuilderService;
  const link = { userId: 'u1', repositoryId: 'r1' };
  const repo = { id: 'r1', owner: 'octocat', name: 'hello' };
  const prisma = {
    userRepository: { findUnique: jest.fn() },
    repository: { findUnique: jest.fn() },
  };
  const users = { getDecryptedGithubToken: jest.fn() };
  const github = {
    getFileHistory: jest.fn(),
    getCommitDetail: jest.fn(),
    getCommitPRs: jest.fn(),
    getIssue: jest.fn(),
  };
  const analysis = {
    searchFiles: jest.fn(),
    listSymbols: jest.fn(),
    readSymbol: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.userRepository.findUnique.mockResolvedValue(link);
    prisma.repository.findUnique.mockResolvedValue(repo);
    users.getDecryptedGithubToken.mockResolvedValue('tok');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceBuilderService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
        { provide: GithubService, useValue: github },
        { provide: AnalysisService, useValue: analysis },
      ],
    }).compile();

    service = module.get<EvidenceBuilderService>(EvidenceBuilderService);
  });

  function mockCode() {
    analysis.searchFiles.mockImplementation((...args: unknown[]) =>
      Promise.resolve(
        String(args[2]).includes('zzz-none')
          ? []
          : [{ file: 'src/pay.ts', line: 42, column: 3, preview: 'x' }],
      ),
    );
    analysis.listSymbols.mockResolvedValue([
      { name: 'Repo.retryPayment', kind: 'method', startLine: 38, endLine: 95 },
    ]);
    analysis.readSymbol.mockResolvedValue({
      path: 'src/pay.ts',
      size: 100,
      truncated: false,
      binary: false,
      content: 'async retryPayment() {}',
    });
  }

  it('reads a hinted symbol directly first', async () => {
    analysis.searchFiles.mockResolvedValue([]);
    analysis.listSymbols.mockImplementation((...args: unknown[]) =>
      Promise.resolve(
        String(args[2]) === 'src/pay.ts'
          ? [
              {
                name: 'Repo.retryPayment',
                kind: 'method',
                startLine: 38,
                endLine: 95,
              },
            ]
          : [],
      ),
    );
    analysis.readSymbol.mockResolvedValue({
      path: 'src/pay.ts',
      size: 50,
      truncated: false,
      binary: false,
      content: 'async retryPayment() {}',
    });
    github.getFileHistory.mockResolvedValue([]);

    const bundle = await service.buildEvidence('u1', 'r1', 'vague words here', {
      targetFile: 'src/pay.ts',
      targetSymbol: 'Repo.retryPayment',
    });

    expect(bundle.code[0]?.symbol).toBe('Repo.retryPayment');
    expect(bundle.code[0]?.startLine).toBe(38);
  });

  it('recovers a typoed symbol into code evidence', async () => {
    mockCode();
    github.getFileHistory.mockResolvedValue([]);

    const bundle = await service.buildEvidence(
      'u1',
      'r1',
      'why doe retrrrpayment retry twice',
    );

    expect(bundle.code).toHaveLength(1);
    expect(bundle.code[0]?.symbol).toBe('Repo.retryPayment');
    expect(bundle.historyNote).not.toBeNull();
    expect(bundle.commits).toEqual([]);
  });

  it('omits PR/issue sections when the commit has no PR', async () => {
    mockCode();
    github.getFileHistory.mockResolvedValue([
      { sha: 'abc', message: 'fix retry', author: 'a', date: 'd' },
    ]);
    github.getCommitDetail.mockResolvedValue({
      sha: 'abc',
      message: 'fix retry',
      author: 'a',
      date: 'd',
      files: [{ path: 'src/pay.ts', patch: '@@ retry' }],
    });
    github.getCommitPRs.mockResolvedValue([]);

    const bundle = await service.buildEvidence('u1', 'r1', 'why retry twice');

    expect(bundle.commits).toHaveLength(1);
    expect(bundle.diffs).toHaveLength(1);
    expect(bundle.prs).toEqual([]);
    expect(bundle.issues).toEqual([]);
    expect(bundle.historyNote).toBeNull();
  });

  it('prefers commits whose diff touches the evidence files', async () => {
    mockCode();
    github.getFileHistory.mockResolvedValue([
      { sha: 'noisy', message: 'retry retry retry', author: 'a', date: 'd' },
      { sha: 'real', message: 'fix', author: 'a', date: 'd' },
    ]);
    github.getCommitDetail.mockImplementation((...args: unknown[]) =>
      Promise.resolve({
        sha: String(args[3]),
        message: '',
        author: null,
        date: null,
        files:
          String(args[3]) === 'real'
            ? [{ path: 'src/pay.ts', patch: '@@ loop' }]
            : [{ path: 'other.ts', patch: '@@ x' }],
      }),
    );
    github.getCommitPRs.mockResolvedValue([]);

    const bundle = await service.buildEvidence('u1', 'r1', 'retry payment');

    expect(bundle.commits[0]?.sha).toBe('real');
  });

  it('chains PR body refs into fetched issues', async () => {
    mockCode();
    github.getFileHistory.mockResolvedValue([
      { sha: 'abc', message: 'fix', author: 'a', date: 'd' },
    ]);
    github.getCommitDetail.mockResolvedValue({
      sha: 'abc',
      message: 'fix',
      author: 'a',
      date: 'd',
      files: [{ path: 'src/pay.ts', patch: '@@' }],
    });
    github.getCommitPRs.mockResolvedValue([
      { number: 142, title: 'fix retries', body: 'Fixes #141' },
    ]);
    github.getIssue.mockResolvedValue({
      number: 141,
      title: 'dupes',
      body: 'provider 503s',
    });

    const bundle = await service.buildEvidence('u1', 'r1', 'why retry');

    expect(bundle.prs).toHaveLength(1);
    expect(bundle.issues).toHaveLength(1);
    expect(bundle.issues[0]?.number).toBe(141);
  });
});
