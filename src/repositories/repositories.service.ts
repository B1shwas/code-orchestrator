import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ConnectRepositoryDto } from './dto/connect-repository.dto';
import type { GithubRepoDto } from './dto/github-repo.dto';
import type { RepositoryResponseDto } from './dto/repository-response.dto';
import { GitService } from './git.service';
import {
  toGithubRepoDtoList,
  toLinkedRepositoryResponseList,
  toRepositoryResponse,
} from './utils/repository-mapper.util';
import { GithubService } from '../auth/github.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class RepositoriesService implements OnModuleInit {
  private readonly logger = new Logger(RepositoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly git: GitService,
    private readonly users: UsersService,
    private readonly github: GithubService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Clones run as in-process promises, so any CLONING row at boot is
    // stale by definition — the worker died with the previous process.
    // Re-queue as PENDING; the next connect/retry claims and clones it.
    const stale = await this.prisma.repository.updateMany({
      where: { status: 'CLONING' },
      data: { status: 'PENDING', errorMessage: null },
    });
    if (stale.count > 0) {
      this.logger.warn(
        `Re-queued ${stale.count} repositories stuck in CLONING`,
      );
    }
  }

  async listGithubRepos(
    userId: string,
    page = 1,
    perPage = 30,
  ): Promise<GithubRepoDto[]> {
    const token = await this.users.getDecryptedGithubToken(userId);
    const raw = await this.github.listUserRepos(token, page, perPage);
    return toGithubRepoDtoList(raw);
  }

  async listMine(userId: string): Promise<RepositoryResponseDto[]> {
    const links = await this.prisma.userRepository.findMany({
      where: { userId },
      include: { repository: true },
      orderBy: { createdAt: 'desc' },
    });

    return toLinkedRepositoryResponseList(links);
  }

  /* this will run when user tries to connect the repo, after selecting the repo it takes owner and the name of the repo and clone it in background */
  async connect(
    userId: string,
    dto: ConnectRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    const owner = dto.owner.trim().toLowerCase();
    const name = dto.name.trim().toLowerCase();

    let detail;
    let cloneToken: string;

    try {
      // extracting token (github) from the userId and repo details to get the clone Urls
      cloneToken = await this.users.getDecryptedGithubToken(userId);
      detail = await this.github.getRepo(cloneToken, owner, name);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (
        typeof err === 'object' &&
        err !== null &&
        'status' in err &&
        (err as { status: number }).status === 401
      ) {
        throw new UnauthorizedException('Invalid Github token');
      }
      throw err;
    }

    // we don't do create or update as multiple user can use the same repo which they have access to, so instead of cloning the same repo in different places, we reuse the same
    const repo = await this.prisma.repository.upsert({
      where: { owner_name: { owner, name } },
      create: {
        githubRepoId: detail.githubRepoId,
        owner,
        name,
        cloneUrl: detail.cloneUrl,
        defaultBranch: detail.defaultBranch,
        localPath: this.git.buildCanonicalPath(owner, name),
        status: 'PENDING',
      },
      update: {},
    });

    await this.prisma.userRepository.createMany({
      data: [{ userId, repositoryId: repo.id }],
      skipDuplicates: true,
    });

    void this.doCloneInBackground(repo.id, cloneToken).catch(() => {});

    return toRepositoryResponse(repo);
  }

  async findOne(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryResponseDto> {
    const link = await this.prisma.userRepository.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
      include: { repository: true },
    });

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    return toRepositoryResponse(link.repository);
  }

  async remove(userId: string, repositoryId: string): Promise<void> {
    const link = await this.prisma.userRepository.findUnique({
      where: {
        userId_repositoryId: { userId, repositoryId },
      },
    });

    if (!link) {
      throw new NotFoundException('Repository not found');
    }

    await this.prisma.userRepository.delete({
      where: {
        userId_repositoryId: { userId, repositoryId },
      },
    });
  }

  async retry(
    userId: string,
    repositoryId: string,
  ): Promise<RepositoryResponseDto> {
    const link = await this.prisma.userRepository.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
      include: { repository: true },
    });
    if (!link) throw new NotFoundException('Repository not found');
    if (link.repository.status !== 'ERROR') {
      return toRepositoryResponse(link.repository);
    }
    await this.prisma.repository.update({
      where: { id: repositoryId },
      data: { status: 'PENDING', errorMessage: null },
    });
    const token = await this.users.getDecryptedGithubToken(userId);
    void this.doCloneInBackground(repositoryId, token).catch(() => {});
    const fresh = await this.prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
    });
    return toRepositoryResponse(fresh);
  }

  /* 
  this is where the actual cloning happens
  - it checks if repo is already 'READY' or not to abort the duplicate clone
  - if yes, it adds you in the join of user Repo table
  - if not, then , we add the access-token in the url and clone the repo
  */
  private async doCloneInBackground(
    repoId: string,
    token: string,
  ): Promise<void> {
    const claimed = await this.prisma.repository.updateMany({
      where: { id: repoId, status: 'PENDING' },
      data: { status: 'CLONING' },
    });

    if (claimed.count === 0) return;

    const repo = await this.prisma.repository.findUniqueOrThrow({
      where: { id: repoId },
    });

    try {
      if (await this.git.isCloned(repo.localPath)) {
        await this.prisma.repository.update({
          where: { id: repo.id },
          data: { status: 'READY', errorMessage: null },
        });

        return;
      }

      const authUrl = repo.cloneUrl.replace(
        'https://',
        `https://x-access-token:${token}@`,
      );
      await this.git.clone(authUrl, repo.localPath, repo.defaultBranch);
      await this.prisma.repository.update({
        where: { id: repo.id },
        data: { status: 'READY', errorMessage: null },
      });
    } catch (err) {
      const message = ((err as Error).message ?? 'clone failed')
        .slice(0, 500)
        .replace(/x-access-token:[^@]+@/g, 'x-access-token:<redacted>@');
      await this.prisma.repository.update({
        where: { id: repo.id },
        data: { status: 'ERROR', errorMessage: message },
      });
    }
  }
}
