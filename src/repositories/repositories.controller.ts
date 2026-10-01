import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConnectRepositoryDto } from './dto/connect-repository.dto';
import { GithubRepoDto } from './dto/github-repo.dto';
import { RepositoryResponseDto } from './dto/repository-response.dto';
import { RepositoriesService } from './repositories.service';

@ApiTags('repositories')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('repositories')
export class RepositoriesController {
  constructor(private readonly repos: RepositoriesService) {}

  @Get('github')
  @ApiOperation({ summary: 'List my GitHub repos (live from GitHub API)' })
  @ApiOkResponse({ type: [GithubRepoDto] })
  listGithub(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ): Promise<GithubRepoDto[]> {
    const parsedPage = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const parsedPerPage = Math.min(
      100,
      Math.max(1, parseInt(perPage ?? '30', 10) || 30),
    );
    return this.repos.listGithubRepos(userId, parsedPage, parsedPerPage);
  }

  @Get()
  @ApiOperation({ summary: 'List repositories linked to me' })
  @ApiOkResponse({ type: [RepositoryResponseDto] })
  listMine(
    @CurrentUser('id') userId: string,
  ): Promise<RepositoryResponseDto[]> {
    return this.repos.listMine(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Connect a repo (link + clone once if new)' })
  @ApiOkResponse({ type: RepositoryResponseDto })
  connect(
    @CurrentUser('id') userId: string,
    @Body() dto: ConnectRepositoryDto,
  ): Promise<RepositoryResponseDto> {
    return this.repos.connect(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Repo detail + clone status (linked only)' })
  @ApiOkResponse({ type: RepositoryResponseDto })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<RepositoryResponseDto> {
    return this.repos.findOne(userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink me from repo (keeps files on disk)' })
  remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    return this.repos.remove(userId, id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry clone when status is ERROR' })
  @ApiOkResponse({ type: RepositoryResponseDto })
  retry(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<RepositoryResponseDto> {
    return this.repos.retry(userId, id);
  }
}
