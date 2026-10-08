import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const DEFAULT_CLONE_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_REPO_BYTES = 2_147_483_648;

@Injectable()
export class GitService {
  constructor(private readonly config: ConfigService) {}

  private cloneTimeoutMs(): number {
    return (
      this.config.get<number>('repos.cloneTimeoutMs') ??
      DEFAULT_CLONE_TIMEOUT_MS
    );
  }

  private maxRepoBytes(): number {
    return this.config.get<number>('repos.maxBytes') ?? DEFAULT_MAX_REPO_BYTES;
  }

  // this function is for building the path to where the repo are cloned
  buildCanonicalPath(owner: string, name: string): string {
    const base = this.config.get<string>('repos.basePath') ?? './data/repos';
    const safeOwner = owner.trim().toLowerCase();
    const safeName = name.trim().toLowerCase();

    // this will return the path like /data/repos/b1shwas/myRepo
    return join(base, safeOwner, safeName);
  }

  // Size must never fail a clone — null means "unknown", still READY.
  // -sk (not -sb) so it works on both BSD (macOS) and GNU (Alpine) du.
  async dirSizeBytes(localPath: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync('du', ['-sk', localPath], {
        timeout: 30_000,
      });
      const kb = Number(stdout.split(/\s+/)[0]);
      const size = kb * 1024;
      return Number.isSafeInteger(size) && size >= 0 ? size : null;
    } catch {
      return null;
    }
  }

  /* checking the repo is always cloned or not */
  async isCloned(localPath: string): Promise<boolean> {
    try {
      await access(join(localPath, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async clone(
    authedCloneUrl: string,
    localPath: string,
    branch?: string,
  ): Promise<void> {
    // create a directory to clone the repo
    await mkdir(dirname(localPath), { recursive: true });
    // partial clone: full commit graph + trees locally, file blobs fetch
    // lazily on first read — Why mode can walk history at ~shallow cost.
    const args = ['clone', '--single-branch', '--filter=blob:none'];

    // if branch is mentioned , we will cloned that branch
    if (branch) {
      args.push('--branch', branch);
    }

    args.push(authedCloneUrl, localPath);

    try {
      await execFileAsync('git', args, { timeout: this.cloneTimeoutMs() });
    } catch (err) {
      const message = (err as Error).message.replace(
        /x-access-token:[^@]+@/g,
        'x-access-token:<redacted>@',
      );
      throw new Error(`git clone failed: ${message}`);
    }
  }

  // upgrades a legacy --depth 1 clone to full history on demand. New
  // partial clones are not shallow, so the guard skips them.
  async unshallow(localPath: string): Promise<void> {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--is-shallow-repository'],
      { cwd: localPath },
    );
    if (stdout.trim() !== 'true') return;
    try {
      await execFileAsync('git', ['fetch', '--unshallow'], {
        cwd: localPath,
        timeout: this.cloneTimeoutMs(),
      });
    } catch (err) {
      const message = (err as Error).message.replace(
        /x-access-token:[^@]+@/g,
        'x-access-token:<redacted>@',
      );
      throw new Error(`git fetch --unshallow failed: ${message}`);
    }
  }

  async removeClone(localPath: string): Promise<void> {
    await rm(localPath, { recursive: true, force: true });
  }

  // measures the clone and rejects oversize repos (removing the partial
  // clone first) so disk usage stays predictable. Null still means
  // "unknown, still READY" — only a measured overage fails.
  async measureAndEnforceSize(localPath: string): Promise<number | null> {
    const size = await this.dirSizeBytes(localPath);
    const max = this.maxRepoBytes();
    if (size != null && size > max) {
      await this.removeClone(localPath);
      throw new Error(`Repository exceeds size limit (${size} > ${max} bytes)`);
    }
    return size;
  }
}
