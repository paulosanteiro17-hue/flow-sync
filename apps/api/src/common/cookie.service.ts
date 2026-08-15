import { Inject, Injectable } from '@nestjs/common';
import { COOKIE_NAMES } from '@flowsync/shared';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';

/**
 * Owns every cookie the API writes. Centralised so the security attributes are
 * defined exactly once and cannot drift between endpoints.
 */
@Injectable()
export class CookieService {
  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  private base(httpOnly: boolean, maxAgeMs: number): CookieOptions {
    return {
      httpOnly,
      secure: this.config.COOKIE_SECURE,
      sameSite: this.config.COOKIE_SAMESITE,
      path: '/',
      maxAge: maxAgeMs,
      ...(this.config.COOKIE_DOMAIN ? { domain: this.config.COOKIE_DOMAIN } : {}),
    };
  }

  setAccessToken(response: Response, token: string): void {
    response.cookie(COOKIE_NAMES.accessToken, token, this.base(true, this.config.JWT_ACCESS_TTL * 1000));
  }

  setRefreshToken(response: Response, token: string): void {
    const maxAge = this.config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
    response.cookie(COOKIE_NAMES.refreshToken, token, this.base(true, maxAge));
  }

  /**
   * The CSRF cookie is intentionally readable by JavaScript: the client must echo
   * it back in the `X-CSRF-Token` header for the double-submit check to work.
   * It carries no authority on its own.
   */
  issueCsrfToken(response: Response): string {
    const token = randomBytes(32).toString('base64url');
    const maxAge = this.config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
    response.cookie(COOKIE_NAMES.csrf, token, this.base(false, maxAge));
    return token;
  }

  clearAll(response: Response): void {
    const options: CookieOptions = {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: this.config.COOKIE_SAMESITE,
      path: '/',
      ...(this.config.COOKIE_DOMAIN ? { domain: this.config.COOKIE_DOMAIN } : {}),
    };
    response.clearCookie(COOKIE_NAMES.accessToken, options);
    response.clearCookie(COOKIE_NAMES.refreshToken, options);
    response.clearCookie(COOKIE_NAMES.csrf, { ...options, httpOnly: false });
  }
}
