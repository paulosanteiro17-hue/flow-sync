import { Injectable } from '@nestjs/common';
import {
  DEFAULT_COLUMNS,
  can,
  generateRanks,
  type CreateProjectInput,
  type ListProjectsQuery,
  type ProjectDetail,
  type ProjectSummary,
  type UpdateProjectInput,
} from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { RealtimeService } from '../realtime/realtime.service';

const PROJECT_SUMMARY_SELECT = {
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
} satisfies Prisma.ProjectSelect;

type ProjectSummaryRow = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SUMMARY_SELECT }>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
    query: ListProjectsQuery,
  ): Promise<ProjectSummary[]> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);

    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      // Guests only ever see projects they were explicitly added to.
      ...(can(membership.role, 'project:view_all') ? {} : { members: { some: { userId } } }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.includeArchived || query.status === 'ARCHIVED'
        ? {}
        : { status: { not: 'ARCHIVED' } }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { key: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const projects = await this.prisma.project.findMany({
      where,
      select: PROJECT_SUMMARY_SELECT,
      orderBy: { updatedAt: 'desc' },
    });

    return this.withCompletionCounts(projects);
  }

  /** Lightweight project header, used by the board snapshot and the dashboard. */
  async summaryById(userId: string, projectId: string): Promise<ProjectSummary> {
    await this.access.requireProject(userId, projectId);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: PROJECT_SUMMARY_SELECT,
    });
    const [summary] = await this.withCompletionCounts([project]);
    return summary as ProjectSummary;
  }

  async get(userId: string, workspaceId: string, projectId: string): Promise<ProjectDetail> {
    const context = await this.access.requireProject(userId, projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Project not found');

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        ...PROJECT_SUMMARY_SELECT,
        members: {
          select: {
            id: true,
            addedAt: true,
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { addedAt: 'asc' },
        },
        boards: {
          select: {
            id: true,
            name: true,
            projectId: true,
            isDefault: true,
            rank: true,
            createdAt: true,
          },
          orderBy: { rank: 'asc' },
        },
      },
    });

    const roles = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: project.members.map((member) => member.user.id) } },
      select: { userId: true, role: true },
    });
    const roleByUser = new Map(roles.map((row) => [row.userId, row.role]));

    const [summary] = await this.withCompletionCounts([project]);

    return {
      ...(summary as ProjectSummary),
      members: project.members.map((member) => ({
        id: member.id,
        user: member.user,
        workspaceRole: roleByUser.get(member.user.id) ?? 'MEMBER',
        addedAt: member.addedAt.toISOString(),
      })),
      boards: project.boards.map((board) => ({
        ...board,
        createdAt: board.createdAt.toISOString(),
      })),
    };
  }

  async create(
    userId: string,
    workspaceId: string,
    input: CreateProjectInput,
  ): Promise<ProjectSummary> {
    await this.access.requireWorkspace(userId, workspaceId);

    const duplicate = await this.prisma.project.findUnique({
      where: { workspaceId_key: { workspaceId, key: input.key } },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict(`The project key ${input.key} is already used in this workspace`);
    }

    await this.assertMembersBelong(workspaceId, [
      ...input.memberIds,
      ...(input.leadId ? [input.leadId] : []),
    ]);

    // Creator and lead are always members so the project is never orphaned.
    const memberIds = [
      ...new Set([userId, ...input.memberIds, ...(input.leadId ? [input.leadId] : [])]),
    ];
    const columnRanks = generateRanks(DEFAULT_COLUMNS.length);

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId,
          name: input.name,
          key: input.key,
          description: input.description ?? null,
          status: input.status,
          color: input.color,
          ...(input.icon ? { icon: input.icon } : {}),
          leadId: input.leadId ?? null,
          members: { create: memberIds.map((memberId) => ({ userId: memberId })) },
          boards: {
            create: {
              name: 'Main Board',
              rank: generateRanks(1)[0] as string,
              isDefault: true,
              columns: {
                create: DEFAULT_COLUMNS.map((column, index) => ({
                  name: column.name,
                  color: column.color,
                  rank: columnRanks[index] as string,
                  isDone: column.name === 'Done',
                })),
              },
            },
          },
        },
        select: PROJECT_SUMMARY_SELECT,
      });
      return created;
    });

    await this.activity.record({
      workspaceId,
      actorId: userId,
      type: 'PROJECT_CREATED',
      projectId: project.id,
      metadata: { projectName: project.name },
    });

    const [summary] = await this.withCompletionCounts([project]);
    return summary as ProjectSummary;
  }

  async update(
    userId: string,
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary> {
    const context = await this.access.requireProject(userId, projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Project not found');

    if (input.key && input.key !== context.projectKey) {
      const duplicate = await this.prisma.project.findUnique({
        where: { workspaceId_key: { workspaceId, key: input.key } },
        select: { id: true },
      });
      if (duplicate) {
        throw AppException.conflict(
          `The project key ${input.key} is already used in this workspace`,
        );
      }
    }

    if (input.leadId) await this.assertMembersBelong(workspaceId, [input.leadId]);

    const previous = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { status: true, key: true, name: true },
    });

    const project = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: projectId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.icon !== undefined ? { icon: input.icon } : {}),
          ...(input.key !== undefined ? { key: input.key } : {}),
          ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
          ...(input.status === 'ARCHIVED'
            ? { archivedAt: new Date() }
            : previous.status === 'ARCHIVED' && input.status
              ? { archivedAt: null }
              : {}),
        },
        select: PROJECT_SUMMARY_SELECT,
      });

      // Renaming the project key rewrites every task key so readable ids stay consistent.
      if (input.key && input.key !== previous.key) {
        const tasks = await tx.task.findMany({
          where: { projectId },
          select: { id: true, number: true },
        });
        for (const task of tasks) {
          await tx.task.update({
            where: { id: task.id },
            data: { key: `${input.key}-${task.number}` },
          });
        }
      }

      // Ensure the lead is also a project member.
      if (input.leadId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: input.leadId } },
          create: { projectId, userId: input.leadId },
          update: {},
        });
      }

      return updated;
    });

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId,
      type: input.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_UPDATED',
      metadata: { projectName: project.name },
    });

    const [summary] = await this.withCompletionCounts([project]);
    await this.realtime.emitToProject(
      projectId,
      'project.updated',
      { project: summary as ProjectSummary },
      { actorId: userId },
    );

    return summary as ProjectSummary;
  }

  async remove(userId: string, workspaceId: string, projectId: string): Promise<void> {
    const context = await this.access.requireProject(userId, projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Project not found');
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async addMembers(
    userId: string,
    workspaceId: string,
    projectId: string,
    userIds: string[],
  ): Promise<ProjectDetail> {
    const context = await this.access.requireProject(userId, projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Project not found');

    await this.assertMembersBelong(workspaceId, userIds);

    await this.prisma.projectMember.createMany({
      data: userIds.map((memberId) => ({ projectId, userId: memberId })),
      skipDuplicates: true,
    });

    return this.get(userId, workspaceId, projectId);
  }

  async removeMember(
    userId: string,
    workspaceId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<ProjectDetail> {
    const context = await this.access.requireProject(userId, projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Project not found');

    await this.prisma.$transaction([
      this.prisma.projectMember.deleteMany({ where: { projectId, userId: targetUserId } }),
      // Someone who is no longer on the project should not stay its lead.
      this.prisma.project.updateMany({
        where: { id: projectId, leadId: targetUserId },
        data: { leadId: null },
      }),
    ]);

    return this.get(userId, workspaceId, projectId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Completed-task counts need a "column is a done column" join, which Prisma's
   * `_count` cannot express. One grouped query for the whole page keeps this at
   * two queries total rather than one per project.
   */
  private async withCompletionCounts(projects: ProjectSummaryRow[]): Promise<ProjectSummary[]> {
    if (projects.length === 0) return [];

    const completed = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: {
        projectId: { in: projects.map((project) => project.id) },
        completedAt: { not: null },
      },
      _count: { _all: true },
    });
    const completedByProject = new Map(
      completed.map((row) => [row.projectId, row._count._all] as const),
    );

    return projects.map((project) => ({
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
    }));
  }

  private async assertMembersBelong(workspaceId: string, userIds: string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;

    const found = await this.prisma.workspaceMember.count({
      where: { workspaceId, userId: { in: unique } },
    });
    if (found !== unique.length) {
      throw AppException.validation(
        'One or more selected people are not members of this workspace',
      );
    }
  }
}
