import { AnalysisService } from 'src/analysis/analysis.service';
import { GithubService } from 'src/auth/github.service';
import { PrismaService } from 'src/prisma';
import { UsersService } from 'src/users/users.service';
import { AgentTool, ToolContext } from './tool.types';

export type ToolDeps = {
  prisma: PrismaService;
  users: UsersService;
  github: GithubService;
  analysis: AnalysisService;
};

async function resolveRepoContext(deps: ToolDeps, ctx: ToolContext) {
  const link = await deps.prisma.userRepository.findUnique({
    where: {
      userId_repositoryId: {
        userId: ctx.userId,
        repositoryId: ctx.repositoryId,
      },
    },
  });

  if (!link) throw new Error('Repository not found');

  const repository = await deps.prisma.repository.findUnique({
    where: { id: ctx.repositoryId },
  });

  if (!repository) throw new Error('Repository not found');

  const token = await deps.users.getDecryptedGithubToken(ctx.userId);

  return {
    owner: repository.owner,
    name: repository.name,
    token,
  };
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function createTools(deps: ToolDeps): AgentTool[] {
  return [
    {
      name: 'list_tree',
      description:
        'List files and folders inside the linked repo. Use first to orient yourself.',
      parameters: {
        path: {
          type: 'string',
          required: false,
          description: 'Repo-relative folder, empty = root',
        },
        depth: {
          type: 'number',
          required: false,
          description: 'Levels deep, default 2',
        },
      },
      execute: (ctx, args) =>
        deps.analysis.listTree(
          ctx.userId,
          ctx.repositoryId,
          str(args.path),
          num(args.depth, 2),
          100,
        ),
    },
    {
      name: 'read_file',
      description:
        'Read a text file. Use when you know the path and want full content.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Repo-relative file path',
        },
      },
      execute: (ctx, args) =>
        deps.analysis.readFile(ctx.userId, ctx.repositoryId, str(args.path)),
    },
    {
      name: 'read_symbol',
      description:
        'Read exactly one function/class by name. Prefer over read_file when you know the symbol.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Repo-relative file path',
        },
        name: {
          type: 'string',
          required: true,
          description: 'Symbol name, dotted for methods (Class.method)',
        },
      },
      execute: (ctx, args) =>
        deps.analysis.readSymbol(
          ctx.userId,
          ctx.repositoryId,
          str(args.path),
          str(args.name),
        ),
    },
    {
      name: 'search_code',
      description:
        'Search file contents for literal text. Use first to locate relevant code.',
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: 'Literal search text',
        },
        limit: {
          type: 'number',
          required: false,
          description: 'Max matches, default 20',
        },
      },
      execute: (ctx, args) =>
        deps.analysis.searchFiles(
          ctx.userId,
          ctx.repositoryId,
          str(args.query),
          num(args.limit, 20),
        ),
    },
    {
      name: 'get_history',
      description:
        'Recent commits touching a file, with diffs. Use to learn why code changed.',
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Repo-relative file path',
        },
      },
      execute: async (ctx, args) => {
        const { owner, name, token } = await resolveRepoContext(deps, ctx);
        const path = str(args.path);
        const history = await deps.github.getFileHistory(
          token,
          owner,
          name,
          path,
          5,
        );
        const details = await Promise.all(
          history
            .slice(0, 3)
            .map((c) => deps.github.getCommitDetail(token, owner, name, c.sha)),
        );
        return { history, details };
      },
    },
    {
      name: 'get_pr_issue',
      description:
        'PRs for a commit plus linked issues. Use to learn why a change was made.',
      parameters: {
        sha: { type: 'string', required: true, description: 'Full commit SHA' },
      },
      execute: async (ctx, args) => {
        const { owner, name, token } = await resolveRepoContext(deps, ctx);
        return deps.github.getCommitPRs(token, owner, name, str(args.sha));
      },
    },
  ];
}

export function describeTools(tools: AgentTool[]): string {
  return tools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(
          ([k, p]) =>
            `${k}: ${p.type}${p.required ? ' (required)' : ''} — ${p.description}`,
        )
        .join('; ');
      return `- ${t.name}: ${t.description} Params: ${params}`;
    })
    .join('\n');
}

export async function executeTool(
  tools: AgentTool[],
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  try {
    return await tool.execute(ctx, args);
  } catch (error) {
    return `Tool error: ${(error as Error).message}`;
  }
}
