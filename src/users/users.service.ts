import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenCipherService } from '../common/crypto/token-cipher.service';
import { UserProfileDto } from './dto/user-profile.dto';

export type UpsertGithubUserInput = {
  githubId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  githubTokenPlain: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
  ) {}

  toProfile(
    user: Pick<User, 'id' | 'githubId' | 'email' | 'name' | 'avatarUrl'>,
  ): UserProfileDto {
    return {
      id: user.id,
      githubId: user.githubId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        githubId: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });
  }

  upsertFromGithub(input: UpsertGithubUserInput) {
    const githubToken = this.cipher.encrypt(input.githubTokenPlain);
    return this.prisma.user.upsert({
      where: { githubId: input.githubId },
      create: {
        githubId: input.githubId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        githubToken,
      },
      update: {
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
        githubToken,
      },
      select: {
        id: true,
        githubId: true,
        email: true,
        name: true,
        avatarUrl: true,
      },
    });
  }

  /** decrypting is for cloning and API use of github only */
  async getDecryptedGithubToken(userId: string): Promise<string> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubToken: true },
    });
    if (!row) throw new Error('User not found');
    return this.cipher.decrypt(row.githubToken);
  }
}
