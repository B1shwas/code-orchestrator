import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalysisService } from './analysis.service';
import { TreeEntryDto } from './dto/tree-entry.dto';
import { FileContentDto } from './dto/file-content.dto';
import { SearchMatchDto } from './dto/search-match.dto';

@ApiTags('analysis')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('repositories/:id')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('tree')
  @ApiOperation({ summary: 'List files/dirs inside a linked READY repo' })
  @ApiOkResponse({ type: [TreeEntryDto] })
  tree(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('path') path?: string,
    @Query('depth') depth?: string,
    @Query('limit') limit?: string,
  ): Promise<TreeEntryDto[]> {
    return this.analysis.listTree(
      userId,
      id,
      path ?? '',
      depth ? parseInt(depth, 10) : 2,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  @Get('file')
  @ApiOperation({ summary: 'Read a text file inside a linked READY repo' })
  @ApiOkResponse({ type: FileContentDto })
  file(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('path') path?: string,
  ): Promise<FileContentDto> {
    return this.analysis.readFile(userId, id, path ?? '');
  }

  @Get('search')
  @ApiOperation({ summary: 'Search text inside a linked READY repo' })
  @ApiOkResponse({ type: [SearchMatchDto] })
  search(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<SearchMatchDto[]> {
    return this.analysis.searchFiles(
      userId,
      id,
      q ?? '',
      limit ? parseInt(limit, 10) : 50,
    );
  }
}
