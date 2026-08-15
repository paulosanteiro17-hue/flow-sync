import { Injectable } from '@nestjs/common';
import { can, type DashboardSummary } from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_SUMMARY_SELECT, TaskMapper } from '../common/task-mapper.service';
import { ActivityService } from '../activity/activity.service';
import { ProjectsService } from '../projects/projects.service';

const DUE_SOON_WINDOW_DAYS = 7;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mapper: TaskMapper,
    private readonly activity: ActivityService,
    private readonly projects: ProjectsService,
  ) {}

  /**
   * Everything the dashboard needs in one round trip. Deliberately workflow-first:
   * what is assigned to me, what is late, what is coming — not vanity analytics.
   */
  async summary(userId: string, workspaceId: string): Promise<DashboardSummary> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);

    const now = new Date();
    const dueSoonLimit = new Date(now.getTime() + DUE_SOON_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const visibleProjects: Prisma.TaskWhereInput = can(membership.role, 'project:view_all')
      ? {}
      : { project: { members: { some: { userId } } } };

    const assignedToMe: Prisma.TaskWhereInput = {
      workspaceId,
      assignees: { some: { userId } },
      ...visibleProjects,
    };

    const [assigned, dueSoon, overdue, completedThisWeek, projects, activity] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...assignedToMe, completedAt: null },
        select: TASK_SUMMARY_SELECT,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
        take: 8,
      }),
      this.prisma.task.findMany({
        where: {
          ...assignedToMe,
          completedAt: null,
          dueDate: { gte: now, lte: dueSoonLimit },
        },
        select: TASK_SUMMARY_SELECT,
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      this.prisma.task.findMany({
        where: { ...assignedToMe, completedAt: null, dueDate: { lt: now } },
        select: TASK_SUMMARY_SELECT,
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      this.prisma.task.count({
        where: { ...assignedToMe, completedAt: { gte: weekAgo } },
      }),
      this.projects.list(userId, workspaceId, {
        includeArchived: false,
        status: undefined,
        search: undefined,
      }),
      this.activity.list(userId, workspaceId, { limit: 12 }),
    ]);

    const [assignedSummaries, dueSoonSummaries, overdueSummaries] = await Promise.all([
      this.mapper.toSummaries(assigned),
      this.mapper.toSummaries(dueSoon),
      this.mapper.toSummaries(overdue),
    ]);

    return {
      assignedToMe: assignedSummaries,
      dueSoon: dueSoonSummaries,
      overdue: overdueSummaries,
      recentProjects: projects.slice(0, 6),
      recentActivity: activity.items,
      stats: {
        assignedOpen: await this.prisma.task.count({ where: { ...assignedToMe, completedAt: null } }),
        completedThisWeek,
        dueSoon: dueSoonSummaries.length,
        overdue: overdueSummaries.length,
      },
    };
  }
}
