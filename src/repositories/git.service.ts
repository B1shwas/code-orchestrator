import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const CLONE_TIMEOUT_MS = 120_000;

@Injectable()
export class GitService {
  constructor(private readonly config: ConfigService) {}

  // this function is for building the path to where the repo are cloned
  buildCanonicalPath(owner: string, name: string): string {
    const base = this.config.get<string>('repos.basePath') ?? './data/repos';
    const safeOwner = owner.trim().toLowerCase();
    const safeName = name.trim().toLowerCase();

    // this will return the path like /data/repos/b1shwas/myRepo
    return join(base, safeOwner, safeName);
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
    const args = ['clone', '--depth', '1'];

    // if branch is mentioned , we will cloned that branch
    if (branch) {
      args.push('--branch', branch);
    }

    args.push(authedCloneUrl, localPath);

    try {
      await execFileAsync('git', args, { timeout: CLONE_TIMEOUT_MS });
    } catch (err) {
      const message = (err as Error).message.replace(
        /x-access-token:[^@]+@/g,
        'x-access-token:<redacted>@',
      );
      throw new Error(`git clone failed: ${message}`);
    }
  }
}
