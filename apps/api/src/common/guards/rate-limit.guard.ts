import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { RedisService } from '../../redis/redis.service';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators';
import { AppException } from '../errors';

/**
 * Applies the per-route sliding-window budget declared with `@RateLimit(...)`.
 * Buckets are keyed by the narrowest identifier available so one noisy tenant or
 * IP cannot exhaust everybody else's allowance.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const name = options.name ?? `${request.method}:${request.route?.path ?? request.path}`;
    const bucket = `${name}:${this.identity(request, options.scope ?? 'ip')}`;

    const result = await this.redis.consumeRateLimit(bucket, options.limit, options.windowMs);

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));

    if (!result.allowed) {
      response.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      throw AppException.rateLimited(result.retryAfterMs);
    }

    return true;
  }

  private identity(request: Request, scope: NonNullable<RateLimitOptions['scope']>): string {
    switch (scope) {
      case 'user':
        return request.auth?.userId ?? this.ip(request);
      case 'workspace':
        return request.workspace?.workspaceId ?? request.auth?.userId ?? this.ip(request);
      case 'ip+email': {
        const body = request.body as { email?: unknown } | undefined;
        const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
        // Hashed so an email address never lands in a Redis key or a log line.
        const digest = createHash('sha256').update(email).digest('base64url').slice(0, 16);
        return `${this.ip(request)}:${digest}`;
      }
      case 'ip':
      default:
        return this.ip(request);
    }
  }

  private ip(request: Request): string {
    // `trust proxy` is configured in main.ts, so `request.ip` already reflects
    // the client address behind a single reverse proxy.
    return request.ip ?? request.socket.remoteAddress ?? 'unknown';
  }
}
