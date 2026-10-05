import { createTools, describeTools, executeTool } from './tools';

const deps = {
  prisma: {
    userRepository: { findUnique: jest.fn() },
    repository: { findUnique: jest.fn() },
  },
  users: { getDecryptedGithubToken: jest.fn() },
  github: {
    getFileHistory: jest.fn(),
    getCommitDetail: jest.fn(),
    getCommitPRs: jest.fn(),
  },
  analysis: {
    listTree: jest.fn(),
    readFile: jest.fn(),
    readSymbol: jest.fn(),
    searchFiles: jest.fn(),
  },
};
const ctx = { userId: 'u1', repositoryId: 'r1' };

describe('agent tools', () => {
  beforeEach(() => jest.clearAllMocks());

  it('exposes six tools with descriptions and schemas', () => {
    const tools = createTools(deps as never);
    expect(tools.map((t) => t.name)).toEqual([
      'list_tree',
      'read_file',
      'read_symbol',
      'search_code',
      'get_history',
      'get_pr_issue',
    ]);
    const text = describeTools(tools);
    expect(text).toContain('search_code');
    expect(text).toContain('query: string (required)');
  });

  it('delegates search to AnalysisService with coerced args', async () => {
    const tools = createTools(deps as never);
    deps.analysis.searchFiles.mockResolvedValue([{ file: 'a.ts' }]);
    const out = await executeTool(tools, ctx, 'search_code', {
      query: 'retry',
      limit: '20',
    });
    expect(out).toEqual([{ file: 'a.ts' }]);
    expect(deps.analysis.searchFiles).toHaveBeenCalledWith(
      'u1',
      'r1',
      'retry',
      20,
    );
  });

  it('resolves repo context with link guard for GitHub tools', async () => {
    const tools = createTools(deps as never);
    deps.prisma.userRepository.findUnique.mockResolvedValue({ id: 'link' });
    deps.prisma.repository.findUnique.mockResolvedValue({
      owner: 'o',
      name: 'n',
    });
    deps.users.getDecryptedGithubToken.mockResolvedValue('tok');
    deps.github.getCommitPRs.mockResolvedValue([{ number: 1 }]);
    const out = await executeTool(tools, ctx, 'get_pr_issue', { sha: 'abc' });
    expect(out).toEqual([{ number: 1 }]);
    expect(deps.github.getCommitPRs).toHaveBeenCalledWith(
      'tok',
      'o',
      'n',
      'abc',
    );
  });

  it('returns unknown tools and failures as text, never throws', async () => {
    const tools = createTools(deps as never);
    await expect(executeTool(tools, ctx, 'nope', {})).rejects.toThrow(
      'Unknown tool',
    );
    deps.analysis.searchFiles.mockRejectedValue(new Error('down'));
    const out = await executeTool(tools, ctx, 'search_code', { query: 'x' });
    expect(out).toBe('Tool error: down');
  });
});
