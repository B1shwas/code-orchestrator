import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUrlResponseDto } from './dto/auth-url.response';
import { GithubCallbackQueryDto } from './dto/github-callback.query';
import { LoginResponseDto } from './dto/login.response';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('github')
  @ApiOperation({
    summary: 'Get GitHub OAuth authorize URL (GitHub-only login)',
  })
  @ApiOkResponse({ type: AuthUrlResponseDto })
  getGithubUrl(): Promise<AuthUrlResponseDto> {
    return this.auth.getAuthorizeUrl();
  }

  @Get('github/callback')
  @ApiOperation({
    summary: 'GitHub OAuth callback — exchanges code for app JWT',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  callback(@Query() query: GithubCallbackQueryDto): Promise<LoginResponseDto> {
    return this.auth.loginWithGithub(query.code, query.state);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Current user profile (requires Bearer JWT)' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid token' })
  me(@CurrentUser('id') userId: string): Promise<UserProfileDto> {
    return this.auth.me(userId);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout (stateless — client discards JWT)' })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  logout(): { ok: boolean } {
    return { ok: true };
  }
}
