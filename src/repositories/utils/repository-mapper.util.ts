import type { Repository } from '@prisma/client';
import { GithubRepoDto } from '../dto/github-repo.dto';
import { RepositoryResponseDto } from '../dto/repository-response.dto';

type LinkedRepository = {
  repository: Repository & {
    _count?: { investigations: number } | null;
  };
};

export type GithubApiRepo = {
  id: number;
  name: string;
  private?: boolean;
  default_branch?: string | null;
  owner?: { login?: string } | null;
};

export function toSizeBytes(value: unknown): number | null {
  // Prisma BigInt arrives as bigint; JSON.stringify would throw on it,
  // so normalize at the boundary. Mocks may hand us plain numbers.
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}

export function toRepositoryResponse(
  repo: Repository & { _count?: { investigations: number } | null },
): RepositoryResponseDto {
  return {
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    status: repo.status,
    stage: repo.stage,
    progress: repo.progress,
    sizeBytes: toSizeBytes(repo.sizeBytes),
    investigationCount: repo._count?.investigations ?? 0,
    createdAt: repo.createdAt,
    updatedAt: repo.updatedAt,
  };
}

export function toLinkedRepositoryResponseList(
  links: LinkedRepository[],
): RepositoryResponseDto[] {
  return links.map((link) => toRepositoryResponse(link.repository));
}

export function toGithubRepoDto(raw: GithubApiRepo): GithubRepoDto {
  const dto = new GithubRepoDto();
  dto.githubRepoId = raw.id;
  dto.owner = raw.owner?.login ?? '';
  dto.name = raw.name;
  dto.private = raw.private ?? false;
  dto.defaultBranch = raw.default_branch ?? null;
  return dto;
}

export function toGithubRepoDtoList(rawList: GithubApiRepo[]): GithubRepoDto[] {
  return rawList.map((raw) => toGithubRepoDto(raw));
}
