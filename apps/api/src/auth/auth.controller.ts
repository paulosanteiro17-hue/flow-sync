import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  COOKIE_NAMES,
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ChangePasswordInput,
  type CurrentUser,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@flowsync/shared';
import type { Request, Response } from 'express';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { CookieService } from '../common/cookie.service';
import { AppException } from '../common/errors';
import { CurrentUser as AuthUser, Public, RateLimit, SkipCsrf } from '../common/decorators';
import { TokenService } from '../common/token.service';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { AuthService, type IssuedSession } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
    private readonly tokens: TokenService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'ip', name: 'auth:signup' })
  @Post('sign-up')
  @ApiOperation({ summary: 'Create an account and start a session' })
  async signUp(
    @Body(zodBody(signUpSchema)) body: SignUpInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const session = await this.auth.signUp(body, this.meta(request));
    this.establishSession(response, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 5, windowMs: 15 * 60 * 1000, scope: 'ip+email', name: 'auth:signin' })
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a session with email and password' })
  async signIn(
    @Body(zodBody(signInSchema)) body: SignInInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const session = await this.auth.signIn(body, this.meta(request));
    this.establishSession(response, session);
    return this.auth.me(session.userId);
  }

  /**
   * One-click entry point for reviewers. Signs in as the seeded demo account so a
   * recruiter can explore a populated workspace without creating one first.
   */
  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, scope: 'ip', name: 'auth:demo' })
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in to the read-to-explore demo workspace' })
  async demo(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    if (!this.config.DEMO_ENABLED) {
      throw AppException.notFound('Demo access is disabled on this deployment');
    }
    const session = await this.auth.signIn(
      { email: this.config.DEMO_EMAIL, password: this.config.DEMO_PASSWORD },
      this.meta(request),
    );
    this.establishSession(response, session);
    return this.auth.me(session.userId);
  }

  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 30, windowMs: 15 * 60 * 1000, scope: 'ip', name: 'auth:refresh' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const session = await this.auth.refresh(cookies?.[COOKIE_NAMES.refreshToken], this.meta(request));
    this.establishSession(response, session);
    return this.auth.me(session.userId);
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session' })
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    await this.auth.signOut(cookies?.[COOKIE_NAMES.refreshToken]);
    this.cookies.clearAll(response);
  }

  @Post('sign-out-everywhere')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async signOutEverywhere(
    @AuthUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOutEverywhere(user.userId);
    this.cookies.clearAll(response);
  }

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user with their preferences' })
  me(@AuthUser() user: AuthenticatedUser): Promise<CurrentUser> {
    return this.auth.me(user.userId);
  }

  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, scope: 'ip+email', name: 'auth:reset-request' })
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a password reset link (always succeeds)' })
  async forgotPassword(
    @Body(zodBody(requestPasswordResetSchema)) body: RequestPasswordResetInput,
  ): Promise<{ ok: true }> {
    await this.auth.requestPasswordReset(body.email, this.config.webOrigins[0] ?? '');
    return { ok: true };
  }

  @Public()
  @SkipCsrf()
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'ip', name: 'auth:reset' })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete a password reset' })
  async resetPassword(
    @Body(zodBody(resetPasswordSchema)) body: ResetPasswordInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body);
    this.cookies.clearAll(response);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the password of the signed-in user' })
  async changePassword(
    @AuthUser() user: AuthenticatedUser,
    @Body(zodBody(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.userId, body);
    this.cookies.clearAll(response);
  }

  private establishSession(response: Response, session: IssuedSession): void {
    const accessToken = this.tokens.signAccessToken({
      userId: session.userId,
      email: session.email,
    });
    this.cookies.setAccessToken(response, accessToken);
    this.cookies.setRefreshToken(response, session.refreshToken);
    this.cookies.issueCsrfToken(response);
  }

  private meta(request: Request) {
    return {
      userAgent: request.header('user-agent'),
      ipAddress: request.ip,
    };
  }
}
