import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { COOKIE_NAMES, SOCKET_ID_HEADER } from '@flowsync/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators';
import { AppException } from '../errors';
import { TokenService } from '../token.service';

/**
 * Step 1 of the guard chain: proves who the caller is, using the httpOnly access
 * cookie only. Bearer headers are deliberately not accepted — a single auth path
 * means a single place to get it right.
 */
@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();

    const socketId = request.header(SOCKET_ID_HEADER);
    if (socketId && socketId.length <= 64) {
      request.originSocketId = socketId;
    }

    const cookies = request.cookies as Record<string, string | undefined> | undefined;
    const auth = this.tokens.verifyAccessToken(cookies?.[COOKIE_NAMES.accessToken]);
    if (auth) request.auth = auth;

    if (isPublic) return true;
    if (!auth) throw AppException.unauthenticated();

    return true;
  }
}
