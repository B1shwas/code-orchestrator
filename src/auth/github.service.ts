import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string | null;
};

export type GithubProfile = {
  githubId: string;
  login: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type GithubApiRepoRaw = {
  id: number;
  name: string;
  private?: boolean;
  default_branch?: string | null;
  owner?: { login?: string } | null;
  clone_url?: string;
};

export type GithubRepoDetail = {
  githubRepoId: number;
  owner: string;
  name: string;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
};

export type GithubCommitSummary = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
};

export type GithubCommitFilePatch = {
  path: string;
  patch: string;
};

export type GithubCommitDetail = {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
  files: GithubCommitFilePatch[];
};

export type GithubPR = {
  number: number;
  title: string;
  body: string | null;
};

export type GithubIssue = {
  number: number;
  title: string;
  body: string | null;
};

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';
const GITHUB_TIMEOUT_MS = 10_000;

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly config: ConfigService) {}

  async exchangeCode(
    code: string,
  ): Promise<{ accessToken: string; scope: string }> {
    const clientId = this.config.getOrThrow<string>('github.clientId');
    const clientSecret = this.config.getOrThrow<string>('github.clientSecret');
    const redirectUri = this.config.getOrThrow<string>('github.callbackUrl');

    let res: Response;
    try {
      res = await fetch(GITHUB_OAUTH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'WhyCODE',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
    } catch (err) {
      this.logger.error(
        `Token exchange network error: ${(err as Error).message}`,
      );
      throw new BadGatewayException('GitHub token exchange failed');
    }

    const data = (await res.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token) {
      this.logger.warn(`Token exchange rejected: ${data.error ?? res.status}`);
      throw new UnauthorizedException(
        data.error_description ?? 'GitHub OAuth failed',
      );
    }
    return { accessToken: data.access_token, scope: data.scope ?? '' };
  }

  async getProfile(
    accessToken: string,
  ): Promise<{ profile: GithubProfile; scopes: string[] }> {
    const res = await this.authedGet('/user', accessToken);
    const scopesHeader = res.headers.get('x-oauth-scopes') ?? '';
    const data = (await res.json()) as {
      id: number;
      login?: string;
      name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    return {
      profile: {
        githubId: String(data.id),
        login: data.login ?? null,
        name: data.name ?? null,
        email: data.email ?? null,
        avatarUrl: data.avatar_url ?? null,
      },
      scopes: scopesHeader
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  async getEmails(accessToken: string): Promise<GithubEmail[]> {
    let res: Response;
    try {
      res = await this.authedGet('/user/emails', accessToken);
    } catch {
      return [];
    }
    if (!res.ok) return [];
    const data = (await res.json()) as GithubEmail[];
    return Array.isArray(data) ? data : [];
  }

  async getRepo(
    accessToken: string,
    owner: string,
    name: string,
  ): Promise<GithubRepoDetail> {
    const res = await this.authedGet(`/repos/${owner}/${name}`, accessToken, {
      allowNotFound: true,
    });
    if (res.status === 404) throw new NotFoundException('Repository not found');
    const data = (await res.json()) as GithubApiRepoRaw;

    return {
      githubRepoId: data.id,
      owner: data.owner?.login ?? owner,
      name: data.name,
      cloneUrl: data.clone_url ?? `https://github.com/${owner}/${name}.git`,
      defaultBranch: data.default_branch ?? 'main',
      private: data.private ?? false,
    };
  }

  async listUserRepos(
    accessToken: string,
    page = 1,
    perPage = 30,
  ): Promise<GithubApiRepoRaw[]> {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      affiliation: 'owner,collaborator,organization_member',
      sort: 'updated',
    });

    const res = await this.authedGet(`/user/repos?${params}`, accessToken);
    const data = (await res.json()) as GithubApiRepoRaw[];
    return Array.isArray(data) ? data : [];
  }

  async getFileHistory(
    accessToken: string,
    owner: string,
    name: string,
    path: string,
    limit = 5,
  ): Promise<GithubCommitSummary[]> {
    const params = new URLSearchParams({
      path,
      per_page: String(Math.min(Math.max(1, limit), 20)),
    });
    const res = await this.authedGet(
      `/repos/${owner}/${name}/commits?${params}`,
      accessToken,
    );
    const data = (await res.json()) as {
      sha?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string } | null;
      };
    }[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((c) => typeof c.sha === 'string')
      .map((c) => ({
        sha: c.sha as string,
        message: c.commit?.message ?? '',
        author: c.commit?.author?.name ?? null,
        date: c.commit?.author?.date ?? null,
      }));
  }

  async getCommitDetail(
    accessToken: string,
    owner: string,
    name: string,
    sha: string,
  ): Promise<GithubCommitDetail> {
    const res = await this.authedGet(
      `/repos/${owner}/${name}/commits/${sha}`,
      accessToken,
      { allowNotFound: true },
    );
    if (res.status === 404) throw new NotFoundException('Commit not found');
    const data = (await res.json()) as {
      sha?: string;
      commit?: {
        message?: string;
        author?: { name?: string; date?: string } | null;
      };
      files?: { filename?: string; patch?: string }[];
    };
    const files = Array.isArray(data.files) ? data.files : [];
    return {
      sha: data.sha ?? sha,
      message: data.commit?.message ?? '',
      author: data.commit?.author?.name ?? null,
      date: data.commit?.author?.date ?? null,
      files: files
        .filter((f) => typeof f.filename === 'string')
        .map((f) => ({
          path: f.filename as string,
          // patches can be huge; binary/oversize files carry no patch at all
          patch: (f.patch ?? '').split('\n').slice(0, 200).join('\n'),
        })),
    };
  }

  async getCommitPRs(
    accessToken: string,
    owner: string,
    name: string,
    sha: string,
  ): Promise<GithubPR[]> {
    const res = await this.authedGet(
      `/repos/${owner}/${name}/commits/${sha}/pulls`,
      accessToken,
      { allowNotFound: true },
    );
    // No associated PR (direct push, old history) is normal, not failure.
    if (res.status === 404) return [];
    const data = (await res.json()) as {
      number?: number;
      title?: string;
      body?: string | null;
    }[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((pr) => typeof pr.number === 'number')
      .map((pr) => ({
        number: pr.number as number,
        title: pr.title ?? '',
        body: (pr.body ?? null)?.slice(0, 500) ?? null,
      }));
  }

  async getIssue(
    accessToken: string,
    owner: string,
    name: string,
    issueNumber: number,
  ): Promise<GithubIssue> {
    const res = await this.authedGet(
      `/repos/${owner}/${name}/issues/${issueNumber}`,
      accessToken,
    );
    const data = (await res.json()) as {
      number?: number;
      title?: string;
      body?: string | null;
    };
    if (typeof data.number !== 'number') {
      throw new BadGatewayException('GitHub API request failed');
    }
    return {
      number: data.number,
      title: data.title ?? '',
      body: (data.body ?? null)?.slice(0, 500) ?? null,
    };
  }

  private async authedGet(
    path: string,
    accessToken: string,
    options?: { allowNotFound?: boolean },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${GITHUB_API}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'WhyCODE',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new BadGatewayException('GitHub API timed out');
      }
      this.logger.error(`GitHub API network error (${path})`);
      throw new BadGatewayException('GitHub API unreachable');
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401)
      throw new UnauthorizedException('Invalid GitHub token');
    // callers that distinguish "missing" from "broken" (commit detail,
    // PR lookup) opt into receiving the 404 and decide themselves.
    if (res.status === 404 && options?.allowNotFound) return res;
    if (!res.ok) {
      this.logger.warn(`GitHub API ${path} -> ${res.status}`);
      throw new BadGatewayException('GitHub API request failed');
    }
    return res;
  }
}
