import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@flowsync/shared';
import type { Request } from 'express';
import { AppException } from './errors';
import type { AuthenticatedUser, WorkspaceContext } from './auth-context';

export const IS_PUBLIC_KEY = 'flowsync:isPublic';
export const PERMISSIONS_KEY = 'flowsync:permissions';
export const RATE_LIMIT_KEY = 'flowsync:rateLimit';
export const SKIP_CSRF_KEY = 'flowsync:skipCsrf';

/** Opts a route out of authentication. Used only by /auth and health endpoints. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Requires every listed permission for the caller's workspace role. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Exempts a route from the CSRF double-submit check. Only safe for endpoints that
 * do not rely on cookie authentication at all (sign-in, sign-up, refresh, which
 * carry their own protections).
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** What the bucket is keyed by. `email` additionally mixes in the request body email. */
  scope?: 'ip' | 'user' | 'workspace' | 'ip+email';
  /** Bucket name; defaults to the route path. */
  name?: string;
}

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.auth) throw AppException.unauthenticated();
    return data ? request.auth[data] : request.auth;
  },
);

export const CurrentWorkspace = createParamDecorator(
  (data: keyof WorkspaceContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.workspace) {
      throw AppException.forbidden('Workspace context is missing for this route');
    }
    return data ? request.workspace[data] : request.workspace;
  },
);

/** The socket that issued the request, so the server can skip echoing to it. */
export const OriginSocketId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.originSocketId ?? null;
});

export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.id ?? 'unknown';
});
