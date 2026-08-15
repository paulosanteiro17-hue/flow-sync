import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../errors';

/**
 * Step 3 of the guard chain: resolves the caller's membership of the workspace
 * named in the route and attaches it to the request.
 *
 * Every tenant-scoped route is nested under `/workspaces/:workspaceId/...`, which
 * makes tenancy explicit in the URL and reduces this check to a single indexed
 * lookup. A caller who is not a member gets `404`, never `403`: telling them the
 * workspace exists would leak the tenant's existence.
 */
@Injectable()
export class WorkspaceContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    const params = request.params as Record<string, string | undefined>;
    const workspaceId = params.workspaceId;

    if (!workspaceId) return true;
    if (!request.auth) throw AppException.unauthenticated();

    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: request.auth.userId } },
      select: { id: true, role: true, workspaceId: true },
    });

    if (!member) throw AppException.notFound('Workspace not found');

    request.workspace = {
      workspaceId: member.workspaceId,
      memberId: member.id,
      role: member.role,
    };

    return true;
  }
}
