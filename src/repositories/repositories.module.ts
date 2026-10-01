import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GitService } from './git.service';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService, GitService, JwtService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
