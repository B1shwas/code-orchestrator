import { Injectable, NotFoundException } from '@nestjs/common';
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

  // TODO(you): connect flow —
  // 1. normalize owner/name (trim, lowercase?)
  // 2. verify access with user's token (GET /repos/{owner}/{name})
  // 3. upsert canonical Repository by (owner, name)
  // 4. create UserRepository link (ignore if already linked)
  // 5. if newly created, trigger background clone (don't await)
  connect(
    userId: string,
    dto: ConnectRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    void userId;
    void dto;
    return Promise.reject(new Error('Not implemented'));
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

  // TODO(you): retry clone when status is ERROR (or stuck CLONING).
  // Check link first, then re-trigger background clone.
  retry(userId: string, repositoryId: string): Promise<RepositoryResponseDto> {
    void userId;
    void repositoryId;
    return Promise.reject(new Error('Not implemented'));
  }
}
