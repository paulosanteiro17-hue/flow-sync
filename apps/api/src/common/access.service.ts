import { Injectable } from '@nestjs/common';
import { can, type WorkspaceRole } from '@flowsync/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from './errors';

export interface WorkspaceAccess {
  workspaceId: string;
  role: WorkspaceRole;
  memberId: string;
}

export interface ProjectAccess extends WorkspaceAccess {
  projectId: string;
  projectKey: string;
  projectName: string;
}

export interface BoardAccess extends ProjectAccess {
  boardId: string;
}

export interface TaskAccess extends ProjectAccess {
  taskId: string;
  taskKey: string;
  boardId: string;
  columnId: string;
}

/**
 * The single place where "may this user touch this resource?" is answered.
 *
 * Every lookup resolves the resource **and** the caller's membership in one query,
 * so there is no window in which a resource is loaded before ownership is known.
 * Failures are always `404`: telling a stranger that a board exists but is off
 * limits would leak the existence of another tenant's data.
 *
 * Guests are a special case — they only see projects they were explicitly added to,
 * which is expressed as the `project:view_all` permission everyone else has.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireWorkspace(userId: string, workspaceId: string): Promise<WorkspaceAccess> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true, role: true, workspaceId: true },
    });
    if (!member) throw AppException.notFound('Workspace not found');
    return { workspaceId: member.workspaceId, role: member.role, memberId: member.id };
  }

  async requireProject(userId: string, projectId: string): Promise<ProjectAccess> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: { members: { some: { userId } } },
      },
      select: {
        id: true,
        key: true,
        name: true,
        workspaceId: true,
        members: { where: { userId }, select: { id: true } },
        workspace: {
          select: { members: { where: { userId }, select: { id: true, role: true } } },
        },
      },
    });

    if (!project) throw AppException.notFound('Project not found');

    const membership = project.workspace.members[0];
    if (!membership) throw AppException.notFound('Project not found');

    // Guests are scoped to their explicitly assigned projects.
    if (!can(membership.role, 'project:view_all') && project.members.length === 0) {
      throw AppException.notFound('Project not found');
    }

    return {
      workspaceId: project.workspaceId,
      role: membership.role,
      memberId: membership.id,
      projectId: project.id,
      projectKey: project.key,
      projectName: project.name,
    };
  }

  async requireBoard(userId: string, boardId: string): Promise<BoardAccess> {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, project: { workspace: { members: { some: { userId } } } } },
      select: { id: true, projectId: true },
    });
    if (!board) throw AppException.notFound('Board not found');

    const project = await this.requireProject(userId, board.projectId);
    return { ...project, boardId: board.id };
  }

  async requireTask(userId: string, taskId: string): Promise<TaskAccess> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspace: { members: { some: { userId } } } },
      select: { id: true, key: true, projectId: true, boardId: true, columnId: true },
    });
    if (!task) throw AppException.notFound('Task not found');

    const project = await this.requireProject(userId, task.projectId);
    return {
      ...project,
      taskId: task.id,
      taskKey: task.key,
      boardId: task.boardId,
      columnId: task.columnId,
    };
  }

  /** Throws unless the role carries the permission. Used where a route-level guard cannot express the rule. */
  assert(role: WorkspaceRole, permission: Parameters<typeof can>[1], message?: string): void {
    if (!can(role, permission)) {
      throw AppException.forbidden(message ?? 'You do not have permission to do that');
    }
  }
}
