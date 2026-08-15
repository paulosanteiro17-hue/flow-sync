import { Injectable } from '@nestjs/common';
import {
  can,
  stripMentionMarkup,
  truncate,
  type SearchQuery,
  type SearchResults,
} from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_SUMMARY_SELECT, TaskMapper } from '../common/task-mapper.service';

/**
 * Cross-entity search backing both the global search page and the ⌘K palette.
 *
 * Matching is case-insensitive substring matching over indexed columns. At the
 * scale this product targets (thousands of tasks per workspace) that is fast and
 * exact; the upgrade path to Postgres full-text search is documented in the
 * README under "Future Improvements" and needs no schema change beyond a
 * generated `tsvector` column.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mapper: TaskMapper,
  ) {}

  async search(userId: string, workspaceId: string, query: SearchQuery): Promise<SearchResults> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);
    const types = query.types ?? ['projects', 'tasks', 'members', 'comments'];
    const term = query.q;

    // Guests only ever search inside projects they belong to.
    const projectScope: Prisma.ProjectWhereInput = can(membership.role, 'project:view_all')
      ? {}
      : { members: { some: { userId } } };

    const [projects, taskRows, members, comments] = await Promise.all([
      types.includes('projects')
        ? this.prisma.project.findMany({
            where: {
              workspaceId,
              ...projectScope,
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { key: { contains: term, mode: 'insensitive' } },
              ],
            },
            select: {
              id: true,
              name: true,
              key: true,
              description: true,
              status: true,
              color: true,
              icon: true,
              createdAt: true,
              updatedAt: true,
              lead: { select: { id: true, name: true, avatarUrl: true } },
              _count: { select: { members: true, tasks: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: query.limit,
          })
        : Promise.resolve([]),

      types.includes('tasks')
        ? this.prisma.task.findMany({
            where: {
              workspaceId,
              project: projectScope,
              OR: [
                { title: { contains: term, mode: 'insensitive' } },
                { key: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
              ],
            },
            select: TASK_SUMMARY_SELECT,
            orderBy: { updatedAt: 'desc' },
            take: query.limit,
          })
        : Promise.resolve([]),

      types.includes('members')
        ? this.prisma.workspaceMember.findMany({
            where: {
              workspaceId,
              user: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' } },
                  { email: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
            select: {
              role: true,
              user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
            take: query.limit,
          })
        : Promise.resolve([]),

      types.includes('comments')
        ? this.prisma.comment.findMany({
            where: {
              workspaceId,
              body: { contains: term, mode: 'insensitive' },
              task: { project: projectScope },
            },
            select: {
              id: true,
              body: true,
              taskId: true,
              task: { select: { key: true } },
              author: { select: { id: true, name: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: query.limit,
          })
        : Promise.resolve([]),
    ]);

    const completed = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: { projectId: { in: projects.map((project) => project.id) }, completedAt: { not: null } },
      _count: { _all: true },
    });
    const completedByProject = new Map(completed.map((row) => [row.projectId, row._count._all]));

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        key: project.key,
        description: project.description,
        status: project.status,
        color: project.color,
        icon: project.icon,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        lead: project.lead,
        memberCount: project._count.members,
        taskCount: project._count.tasks,
        completedTaskCount: completedByProject.get(project.id) ?? 0,
      })),
      tasks: await this.mapper.toSummaries(taskRows),
      members: members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
      })),
      comments: comments.map((comment) => ({
        id: comment.id,
        taskId: comment.taskId,
        taskKey: comment.task.key,
        excerpt: truncate(stripMentionMarkup(comment.body), 160),
        author: comment.author,
      })),
    };
  }
}
