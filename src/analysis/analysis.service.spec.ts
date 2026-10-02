import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisService } from './analysis.service';

describe('AnalysisService', () => {
  let service: AnalysisService;
  const findUnique = jest.fn();

  beforeEach(async () => {
    findUnique.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: PrismaService,
          useValue: { userRepository: { findUnique } },
        },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchFiles guards', () => {
    it('rejects empty query without touching the database', async () => {
      await expect(service.searchFiles('u1', 'r1', '   ')).rejects.toThrow(
        BadRequestException,
      );
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('rejects overlong query', async () => {
      await expect(
        service.searchFiles('u1', 'r1', 'x'.repeat(201)),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when no link exists', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.searchFiles('u1', 'r1', 'foo')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws Conflict when repo is not READY', async () => {
      findUnique.mockResolvedValue({
        repository: { id: 'r1', status: 'CLONING', localPath: '/tmp/x' },
      });
      await expect(service.searchFiles('u1', 'r1', 'foo')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
