import type { Repository } from '@prisma/client';
import {
  toGithubRepoDto,
  toLinkedRepositoryResponseList,
  toRepositoryResponse,
} from './repository-mapper.util';

const baseRepo: Repository = {
  id: 'repo-1',
  githubRepoId: 1296269,
  owner: 'octocat',
  name: 'hello-world',
  cloneUrl: 'https://github.com/octocat/hello-world.git',
  defaultBranch: 'main',
  localPath: './data/repos/octocat/hello-world',
  status: 'READY',
  errorMessage: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

describe('toRepositoryResponse', () => {
  it('exposes only public fields', () => {
    const dto = toRepositoryResponse(baseRepo);

    expect(dto).toEqual({
      id: 'repo-1',
      owner: 'octocat',
      name: 'hello-world',
      defaultBranch: 'main',
      status: 'READY',
      createdAt: baseRepo.createdAt,
      updatedAt: baseRepo.updatedAt,
    });
    expect(dto).not.toHaveProperty('localPath');
    expect(dto).not.toHaveProperty('cloneUrl');
  });
});

describe('toLinkedRepositoryResponseList', () => {
  it('unwraps join rows', () => {
    const result = toLinkedRepositoryResponseList([
      { repository: baseRepo },
      { repository: { ...baseRepo, id: 'repo-2' } },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('repo-1');
    expect(result[1]?.id).toBe('repo-2');
  });

  it('returns empty array for no links', () => {
    expect(toLinkedRepositoryResponseList([])).toEqual([]);
  });
});

describe('toGithubRepoDto', () => {
  it('maps GitHub API shape', () => {
    const dto = toGithubRepoDto({
      id: 1296269,
      name: 'hello-world',
      private: false,
      default_branch: 'main',
      owner: { login: 'octocat' },
    });

    expect(dto.githubRepoId).toBe(1296269);
    expect(dto.owner).toBe('octocat');
    expect(dto.name).toBe('hello-world');
    expect(dto.defaultBranch).toBe('main');
  });
});
