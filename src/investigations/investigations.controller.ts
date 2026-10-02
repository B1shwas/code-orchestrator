import {
  Body,
  Controller,
  Get,
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
import { CreateInvestigationDto } from './dto/create-investigation.dto';
import { InvestigationResponseDto } from './dto/investigation-response.dto';
import { InvestigationsService } from './investigations.service';

@ApiTags('investigations')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('investigations')
export class InvestigationsController {
  constructor(private readonly investigations: InvestigationsService) {}

  @Post()
  @ApiOperation({ summary: 'Ask a question (runs async, poll detail)' })
  @ApiOkResponse({ type: InvestigationResponseDto })
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInvestigationDto,
  ): Promise<InvestigationResponseDto> {
    return this.investigations.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my investigations, newest first' })
  @ApiOkResponse({ type: [InvestigationResponseDto] })
  list(
    @CurrentUser('id') userId: string,
    @Query('repositoryId') repositoryId?: string,
    @Query('limit') limit?: string,
  ): Promise<InvestigationResponseDto[]> {
    return this.investigations.list(
      userId,
      repositoryId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Investigation detail + status (poll while running)',
  })
  @ApiOkResponse({ type: InvestigationResponseDto })
  findOne(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<InvestigationResponseDto> {
    return this.investigations.findOne(userId, id);
  }
}
