import type { Repository } from '@prisma/client';
import { GithubRepoDto } from '../dto/github-repo.dto';
import { RepositoryResponseDto } from '../dto/repository-response.dto';

type LinkedRepository = { repository: Repository };

export type GithubApiRepo = {
  id: number;
  name: string;
  private?: boolean;
  default_branch?: string | null;
  owner?: { login?: string } | null;
};

export function toRepositoryResponse(repo: Repository): RepositoryResponseDto {
  return {
    id: repo.id,
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    status: repo.status,
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
