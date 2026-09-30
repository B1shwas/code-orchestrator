import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { GithubService } from './github.service';

export type AuthorizeUrl = { url: string; state: string; expiresIn: string };
export type LoginResult = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: UserProfileDto;
};

const STATE_TTL = '10m';

export class OAuthStatePayload {
  t!: 'gh-state';
  n!: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly github: GithubService,
  ) {}

  async getAuthorizeUrl(): Promise<AuthorizeUrl> {
    const clientId = this.config.getOrThrow<string>('github.clientId');
    const callbackUrl = this.config.getOrThrow<string>('github.callbackUrl');
    const scope =
      this.config.get<string>('github.scope') ?? 'read:user user:email repo';
    const state = await this.jwt.signAsync(
      {
        t: 'gh-state',
        n: randomBytes(16).toString('hex'),
      } as OAuthStatePayload,
      { expiresIn: STATE_TTL } as never,
    );
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope,
      state,
      allow_signup: 'true',
    });
    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      state,
      expiresIn: STATE_TTL,
    };
  }

  async loginWithGithub(code: string, state: string): Promise<LoginResult> {
    if (!code) throw new BadRequestException('Missing OAuth code');
    await this.verifyState(state);

    const { accessToken } = await this.github.exchangeCode(code);
    const { profile, scopes } = await this.github.getProfile(accessToken);
    this.assertRepoScope(scopes);

    const email = await this.resolveEmail(profile.email, accessToken);
    const saved = await this.users.upsertFromGithub({
      githubId: profile.githubId,
      email,
      name: profile.name ?? profile.login,
      avatarUrl: profile.avatarUrl,
      githubTokenPlain: accessToken,
    });

    const expiresIn = this.config.get<string>('jwt.expiresIn') ?? '7d';
    const appToken = await this.jwt.signAsync(
      { sub: saved.id, typ: 'access' },
      { expiresIn } as never,
    );
    return {
      accessToken: appToken,
      tokenType: 'Bearer',
      expiresIn,
      user: saved,
    };
  }

  async me(userId: string): Promise<UserProfileDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private async verifyState(state: string): Promise<void> {
    if (!state) throw new BadRequestException('Missing OAuth state');
    try {
      const payload = await this.jwt.verifyAsync<OAuthStatePayload>(state);
      if (payload?.t !== 'gh-state' || !payload?.n) {
        throw new UnauthorizedException('Invalid OAuth state');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
  }

  /** We require `repo` scope so private repos can be cloned later. */
  private assertRepoScope(scopes: string[]): void {
    if (scopes.length > 0 && !scopes.includes('repo')) {
      throw new ForbiddenException(
        'GitHub authorization lacks "repo" scope. Re-authenticate with repo access.',
      );
    }
  }

  private async resolveEmail(
    primary: string | null,
    accessToken: string,
  ): Promise<string | null> {
    if (primary) return primary;
    const emails = await this.github.getEmails(accessToken);
    return (
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      emails.find((e) => e.primary)?.email ??
      null
    );
  }
}
