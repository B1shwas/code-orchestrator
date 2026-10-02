import {
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthUrlResponseDto } from './dto/auth-url.response';
import { GithubCallbackQueryDto } from './dto/github-callback.query';

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
    summary:
      'GitHub OAuth callback — exchanges code, redirects to the frontend app',
  })
  @ApiFoundResponse({
    description:
      'Redirects to FRONTEND_URL/auth/callback with the session (or error) as query params',
  })
  async callback(
    @Query() query: GithubCallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const login = await this.auth.loginWithGithub(query.code, query.state);
      res.redirect(this.auth.frontendCallbackUrl(login));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'OAuth exchange failed';
      res.redirect(this.auth.frontendErrorUrl(message));
    }
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
