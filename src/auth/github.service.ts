import {
  BadGatewayException,
  Injectable,
  Logger,
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

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

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

  private async authedGet(
    path: string,
    accessToken: string,
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${GITHUB_API}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'WhyCODE',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch {
      this.logger.error(`GitHub API network error (${path})`);
      throw new BadGatewayException('GitHub API unreachable');
    }
    if (res.status === 401)
      throw new UnauthorizedException('Invalid GitHub token');
    if (!res.ok) {
      this.logger.warn(`GitHub API ${path} -> ${res.status}`);
      throw new BadGatewayException('GitHub API request failed');
    }
    return res;
  }
}
