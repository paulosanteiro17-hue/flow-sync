import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission } from '@flowsync/shared';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators';
import { AppException } from '../errors';

/**
 * Step 4 of the guard chain: compares the resolved workspace role against the
 * permissions the route declares. The matrix itself lives in `@flowsync/shared`
 * so the UI can grey out controls using exactly the same rules.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const workspace = request.workspace;

    if (!workspace) {
      throw AppException.forbidden('This route requires a workspace context');
    }

    const missing = required.filter((permission) => !can(workspace.role, permission));
    if (missing.length > 0) {
      throw AppException.forbidden(
        `Your role (${workspace.role.toLowerCase()}) cannot perform this action`,
      );
    }

    return true;
  }
}
