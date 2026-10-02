import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GithubService } from '../auth/github.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { GitService } from './git.service';
import { RepositoriesService } from './repositories.service';

describe('RepositoriesService', () => {
  let service: RepositoriesService;
  const prisma = {
    repository: {
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    userRepository: {
      findUnique: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const git = {
    buildCanonicalPath: jest.fn().mockReturnValue('/tmp/repos/octocat/hello'),
    isCloned: jest.fn(),
    clone: jest.fn(),
  };
  const users = { getDecryptedGithubToken: jest.fn() };
  const github = { getRepo: jest.fn(), listUserRepos: jest.fn() };

  const repoRow = {
    id: 'repo-1',
    githubRepoId: 1,
    owner: 'octocat',
    name: 'hello',
    cloneUrl: 'https://github.com/octocat/hello.git',
    defaultBranch: 'main',
    localPath: '/tmp/repos/octocat/hello',
    status: 'PENDING',
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.repository.updateMany.mockResolvedValue({ count: 0 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RepositoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: GitService, useValue: git },
        { provide: UsersService, useValue: users },
        { provide: GithubService, useValue: github },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get<RepositoriesService>(RepositoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('connect', () => {
    it('upserts one canonical row and links the user', async () => {
      users.getDecryptedGithubToken.mockResolvedValue('tok');
      github.getRepo.mockResolvedValue({
        githubRepoId: 1,
        owner: 'octocat',
        name: 'hello',
        cloneUrl: 'https://github.com/octocat/hello.git',
        defaultBranch: 'main',
        private: false,
      });
      prisma.repository.upsert.mockResolvedValue(repoRow);
      prisma.userRepository.createMany.mockResolvedValue({ count: 1 });

      const dto = await service.connect('user-1', {
        owner: 'Octocat',
        name: 'Hello',
      });

      expect(dto.id).toBe('repo-1');
      expect(prisma.repository.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { owner_name: { owner: 'octocat', name: 'hello' } },
        }),
      );
      expect(prisma.userRepository.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-1', repositoryId: 'repo-1' }],
        skipDuplicates: true,
      });
    });

    it('lets a second user link the same canonical row', async () => {
      users.getDecryptedGithubToken.mockResolvedValue('tok');
      github.getRepo.mockResolvedValue({
        githubRepoId: 1,
        owner: 'octocat',
        name: 'hello',
        cloneUrl: 'https://github.com/octocat/hello.git',
        defaultBranch: 'main',
        private: false,
      });
      prisma.repository.upsert.mockResolvedValue(repoRow);

      await service.connect('user-2', { owner: 'octocat', name: 'hello' });

      expect(prisma.repository.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.userRepository.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-2', repositoryId: 'repo-1' }],
        skipDuplicates: true,
      });
    });

    it('throws NotFound when GitHub denies access', async () => {
      users.getDecryptedGithubToken.mockResolvedValue('tok');
      github.getRepo.mockRejectedValue(new NotFoundException('nope'));

      await expect(
        service.connect('user-1', { owner: 'octocat', name: 'nope' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.repository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('link guards', () => {
    it('findOne throws when no link exists', async () => {
      prisma.userRepository.findUnique.mockResolvedValue(null);
      await expect(service.findOne('u1', 'r1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('remove throws when no link exists', async () => {
      prisma.userRepository.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', 'r1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.userRepository.delete).not.toHaveBeenCalled();
    });

    it('remove deletes only the link row', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({ id: 'link-1' });
      prisma.userRepository.delete.mockResolvedValue({ id: 'link-1' });

      await service.remove('u1', 'r1');

      expect(prisma.userRepository.delete).toHaveBeenCalledWith({
        where: { userId_repositoryId: { userId: 'u1', repositoryId: 'r1' } },
      });
      expect(prisma.repository.update).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    it('returns the repo untouched when not in ERROR', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { ...repoRow, status: 'READY' },
      });

      const dto = await service.retry('u1', 'r1');

      expect(dto.status).toBe('READY');
      expect(prisma.repository.update).not.toHaveBeenCalled();
    });

    it('re-arms ERROR rows back to PENDING', async () => {
      prisma.userRepository.findUnique.mockResolvedValue({
        repository: { ...repoRow, status: 'ERROR' },
      });
      prisma.repository.update.mockResolvedValue({
        ...repoRow,
        status: 'PENDING',
      });
      prisma.repository.findUniqueOrThrow.mockResolvedValue({
        ...repoRow,
        status: 'PENDING',
      });
      users.getDecryptedGithubToken.mockResolvedValue('tok');

      const dto = await service.retry('u1', 'r1');

      expect(prisma.repository.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'PENDING', errorMessage: null },
      });
      expect(dto.status).toBe('PENDING');
    });
  });

  describe('onModuleInit', () => {
    it('re-queues rows stuck in CLONING', async () => {
      prisma.repository.updateMany.mockResolvedValue({ count: 2 });

      await service.onModuleInit();

      expect(prisma.repository.updateMany).toHaveBeenCalledWith({
        where: { status: 'CLONING' },
        data: { status: 'PENDING', errorMessage: null },
      });
    });
  });
});
