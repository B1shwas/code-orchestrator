import {
  Injectable,
  NotFoundException,
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
export class RepositoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly git: GitService,
    private readonly users: UsersService,
    private readonly github: GithubService,
  ) {}

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

  async connect(
    userId: string,
    dto: ConnectRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    const owner = dto.owner.trim().toLowerCase();
    const name = dto.name.trim().toLowerCase();

    let detail;
    let cloneToken: string;

    try {
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
