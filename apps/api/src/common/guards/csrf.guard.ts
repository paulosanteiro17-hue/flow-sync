import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COOKIE_NAMES, CSRF_HEADER } from '@flowsync/shared';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { SKIP_CSRF_KEY } from '../decorators';
import { AppException, ERROR_CODES } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection.
 *
 * Cookie auth plus a browser client means a cross-site form post would otherwise
 * carry the session automatically. `SameSite` alone is not enough once the web app
 * and the API live on different origins (which forces `SameSite=None`), so every
 * state-changing request must echo the readable `fs_csrf` cookie back in a header
 * that only same-origin JavaScript can set.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.[COOKIE_NAMES.csrf];
    const headerToken = request.header(CSRF_HEADER);

    if (!cookieToken || !headerToken || !this.equals(cookieToken, headerToken)) {
      throw new AppException(
        ERROR_CODES.CSRF_FAILED,
        'CSRF token missing or invalid. Refresh the page and try again.',
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }

  private equals(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }
}
