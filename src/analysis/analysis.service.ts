import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { readdir, realpath, stat, open } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWithin } from './utils/path-safety.util';
import { parseGrepOutput } from './utils/grep-parser.util';
import { TreeEntryDto } from './dto/tree-entry.dto';
import { FileContentDto } from './dto/file-content.dto';
import { SearchMatchDto } from './dto/search-match.dto';

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const DEFAULT_DEPTH = 2;
const DEFAULT_LIMIT = 100;

const SNIFF_LEN = 8000;
const SEARCH_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_QUERY_LEN = 200;
const DEFAULT_SEARCH_LIMIT = 50;

const DEFAULT_MAX_TREE_DEPTH = 5;
const DEFAULT_MAX_TREE_ENTRIES = 200;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_HARD_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SEARCH_RESULTS = 100;

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private maxTreeDepth(): number {
    return (
      this.config.get<number>('analysis.maxTreeDepth') ?? DEFAULT_MAX_TREE_DEPTH
    );
  }

  private maxTreeEntries(): number {
    return (
      this.config.get<number>('analysis.maxTreeEntries') ??
      DEFAULT_MAX_TREE_ENTRIES
    );
  }

  private maxFileBytes(): number {
    return (
      this.config.get<number>('analysis.maxFileBytes') ?? DEFAULT_MAX_FILE_BYTES
    );
  }

  private hardMaxBytes(): number {
    return (
      this.config.get<number>('analysis.hardMaxBytes') ?? DEFAULT_HARD_MAX_BYTES
    );
  }

  private searchTimeoutMs(): number {
    return (
      this.config.get<number>('analysis.searchTimeoutMs') ??
      DEFAULT_SEARCH_TIMEOUT_MS
    );
  }

  private maxSearchResults(): number {
    return (
      this.config.get<number>('analysis.maxSearchResults') ??
      DEFAULT_MAX_SEARCH_RESULTS
    );
  }

  async listTree(
    userId: string,
    repositoryId: string,
    subPath = '',
    depth = DEFAULT_DEPTH,
    limit = DEFAULT_LIMIT,
  ) {
    const link = await this.prisma.userRepository.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
      include: { repository: true },
    });

    if (!link) {
      throw new NotFoundException('Repo not found');
    }

    if (link.repository.status !== 'READY')
      throw new ConflictException('Repository is not ready yet');

    const safeDepth = Math.min(Math.max(depth, 1), this.maxTreeDepth());
    const safeLimit = Math.min(Math.max(1, limit), this.maxTreeEntries());

    const root = resolveWithin(link.repository.localPath, subPath);

    const entries: TreeEntryDto[] = [];
    await this.walkLevel(
      link.repository.localPath,
      root,
      1,
      safeDepth,
      entries,
    );

    entries.sort((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === 'dir'
          ? -1
          : 1,
    );

    return entries.slice(0, safeLimit);
  }

  private async walkLevel(
    root: string,
    dirAbs: string,
    level: number,
    maxLevel: number,
    out: TreeEntryDto[],
  ): Promise<void> {
    const dirents = await readdir(dirAbs, { withFileTypes: true });
    for (const dirent of dirents) {
      if (dirent.name.startsWith('.') && dirent.name !== '.gitignore') continue;
      if (dirent.isDirectory() && SKIP_DIRS.has(dirent.name)) continue;
      const abs = join(dirAbs, dirent.name);
      const rel = relative(root, abs);

      if (dirent.isDirectory()) {
        out.push({ name: dirent.name, path: rel, type: 'dir' });
        if (level < maxLevel) {
          await this.walkLevel(root, abs, level + 1, maxLevel, out);
        }
      } else if (dirent.isFile()) {
        const s = await stat(abs);
        out.push({
          name: dirent.name,
          path: rel,
          type: 'file',
          size: s.size,
        });
      }
    }
  }

  async readFile(
    userId: string,
    repositoryId: string,
    subPath: string,
  ): Promise<FileContentDto> {
    const link = await this.prisma.userRepository.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
      include: { repository: true },
    });
    if (!link) throw new NotFoundException('Repository not found');
    if (link.repository.status !== 'READY') {
      throw new ConflictException('Repository is not ready yet');
    }
    if (!subPath || !subPath.trim()) {
      throw new BadRequestException('File path is required');
    }

    const abs = resolveWithin(link.repository.localPath, subPath);
    const rel = relative(link.repository.localPath, abs);
    if (rel === '.git' || rel.startsWith('.git/')) {
      throw new ForbiddenException('Access denied');
    }

    const real = await realpath(abs).catch(() => null);
    if (!real) throw new NotFoundException('File not found');
    const baseResolved = resolve(link.repository.localPath);
    if (real !== baseResolved && !real.startsWith(baseResolved + sep)) {
      throw new ForbiddenException('Access denied');
    }

    const s = await stat(real);
    if (!s.isFile()) throw new BadRequestException('Not a file');
    if (s.size > this.hardMaxBytes()) {
      throw new PayloadTooLargeException('File too large');
    }

    const fh = await open(real, 'r');
    try {
      const headLen = Math.min(s.size, SNIFF_LEN);
      const head = Buffer.alloc(headLen);
      await fh.read(head, 0, headLen, 0);
      if (head.includes(0)) {
        return {
          path: rel,
          size: s.size,
          truncated: false,
          binary: true,
          content: null,
        };
      }
      const readLen = Math.min(s.size, this.maxFileBytes());
      const buf = Buffer.alloc(readLen);
      if (readLen > 0) await fh.read(buf, 0, readLen, 0);
      return {
        path: rel,
        size: s.size,
        truncated: s.size > this.maxFileBytes(),
        binary: false,
        content: buf.toString('utf8'),
      };
    } finally {
      await fh.close();
    }
  }

  async searchFiles(
    userId: string,
    repositoryId: string,
    query: string,
    limit = DEFAULT_SEARCH_LIMIT,
  ): Promise<SearchMatchDto[]> {
    const q = query?.trim() ?? '';
    if (!q) throw new BadRequestException('Search query is required');
    if (q.length > MAX_QUERY_LEN) {
      throw new BadRequestException('Search query too long');
    }

    const link = await this.prisma.userRepository.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
      include: { repository: true },
    });
    if (!link) throw new NotFoundException('Repository not found');
    if (link.repository.status !== 'READY') {
      throw new ConflictException('Repository is not ready yet');
    }

    const safeLimit = Math.min(Math.max(1, limit), this.maxSearchResults());
    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          '-C',
          link.repository.localPath,
          'grep',
          '-n',
          '-I',
          '--column',
          '-F',
          '--max-count',
          String(safeLimit),
          '-e',
          q,
          '--',
          '.',
          ':!node_modules',
          ':!dist',
          ':!coverage',
        ],
        {
          timeout: this.searchTimeoutMs(),
          maxBuffer: SEARCH_MAX_BUFFER_BYTES,
        },
      );
      return parseGrepOutput(stdout, safeLimit);
    } catch (err) {
      // git grep exits 1 when nothing matches — not an error
      if ((err as { code?: number }).code === 1) return [];
      const partial = (err as { stdout?: unknown }).stdout;
      if (typeof partial === 'string' && partial) {
        return parseGrepOutput(partial, safeLimit);
      }
      throw new InternalServerErrorException('Search failed');
    }
  }
}
