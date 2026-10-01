import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

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

  isCloned(localPath: string): Promise<boolean> {
    void localPath;
    return Promise.reject(new Error('Not implemented'));
  }

  clone(
    authedCloneUrl: string,
    localPath: string,
    branch?: string,
  ): Promise<void> {
    void authedCloneUrl;
    void localPath;
    void branch;
    return Promise.reject(new Error('Not implemented'));
  }
}
