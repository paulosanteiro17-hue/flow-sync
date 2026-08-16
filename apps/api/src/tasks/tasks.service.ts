import { Injectable, Logger } from '@nestjs/common';
import {
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_WEIGHT,
  can,
  generateRanks,
  needsRebalance,
  rankBetween,
  truncate,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type MyTasksQuery,
  type SubtaskView,
  type TaskDetail,
  type TaskSummary,
  type UpdateSubtaskInput,
  type UpdateTaskInput,
} from '@flowsync/shared';
import { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_DETAIL_SELECT, TASK_SUMMARY_SELECT, TaskMapper } from '../common/task-mapper.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

/** A rank string this long only appears in pathological drag sequences. */
const RANK_RETRY_LIMIT = 3;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly mapper: TaskMapper,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async get(userId: string, workspaceId: string, taskId: string): Promise<TaskDetail> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');

    const row = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: TASK_DETAIL_SELECT,
    });
    return this.mapper.toDetail(row);
  }

  async list(userId: string, workspaceId: string, query: ListTasksQuery): Promise<TaskSummary[]> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);

    if (query.boardId) await this.access.requireBoard(userId, query.boardId);
    if (query.projectId) await this.access.requireProject(userId, query.projectId);

    const rows = await this.prisma.task.findMany({
      where: {
        workspaceId,
        ...this.visibilityFilter(membership.role, userId),
        ...(query.boardId ? { boardId: query.boardId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.assigneeId ? { assignees: { some: { userId: query.assigneeId } } } : {}),
        ...(query.labelId ? { labels: { some: { labelId: query.labelId } } } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.search ? { OR: this.searchFilter(query.search) } : {}),
        ...(query.dueBefore ? { dueDate: { lte: new Date(query.dueBefore) } } : {}),
        ...(query.dueAfter ? { dueDate: { gte: new Date(query.dueAfter) } } : {}),
        ...(query.status === 'done'
          ? { completedAt: { not: null } }
          : query.status === 'open'
            ? { completedAt: null }
            : {}),
      },
      select: TASK_SUMMARY_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });

    return this.mapper.toSummaries(rows);
  }

  /** The "My Tasks" page: the same rows bucketed by urgency. */
  async myTasks(userId: string, workspaceId: string, query: MyTasksQuery): Promise<TaskSummary[]> {
    await this.access.requireWorkspace(userId, workspaceId);

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const bucketFilter: Prisma.TaskWhereInput =
      query.bucket === 'today'
        ? { completedAt: null, dueDate: { gte: new Date(now.toDateString()), lte: endOfToday } }
        : query.bucket === 'overdue'
          ? { completedAt: null, dueDate: { lt: now } }
          : query.bucket === 'upcoming'
            ? { completedAt: null, dueDate: { gt: endOfToday } }
            : query.bucket === 'completed'
              ? { completedAt: { not: null } }
              : {};

    const rows = await this.prisma.task.findMany({
      where: {
        workspaceId,
        assignees: { some: { userId } },
        ...bucketFilter,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...(query.search ? { OR: this.searchFilter(query.search) } : {}),
      },
      select: TASK_SUMMARY_SELECT,
      orderBy:
        query.sort === 'created'
          ? [{ createdAt: 'desc' }]
          : query.sort === 'updated'
            ? [{ updatedAt: 'desc' }]
            : [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 300,
    });

    const summaries = await this.mapper.toSummaries(rows);

    // Priority ordering is an enum sort, which Postgres would do by declaration
    // order; sorting in memory keeps "Urgent first" honest for a bounded page.
    if (query.sort === 'priority') {
      summaries.sort((a, b) => TASK_PRIORITY_WEIGHT[b.priority] - TASK_PRIORITY_WEIGHT[a.priority]);
    }

    return summaries;
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(
    userId: string,
    workspaceId: string,
    input: CreateTaskInput,
    socketId?: string | null,
  ): Promise<TaskSummary> {
    const column = await this.prisma.boardColumn.findUnique({
      where: { id: input.columnId },
      select: {
        id: true,
        isDone: true,
        boardId: true,
        board: { select: { projectId: true } },
      },
    });
    if (!column) throw AppException.notFound('Column not found');

    const context = await this.access.requireProject(userId, column.board.projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Column not found');
    this.access.assert(context.role, 'task:create');

    await this.assertAssigneesBelong(workspaceId, input.assigneeIds);
    await this.assertLabelsBelong(workspaceId, input.labelIds);

    const task = await this.withRankRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // The counter bump comes first on purpose. It takes a row lock on the
        // project, so concurrent creates in the same project queue up here; by the
        // time each one resolves its rank it can see the previous task committed.
        // Resolving the rank first would have every concurrent create read the
        // same neighbour and compute the same rank.
        const project = await tx.project.update({
          where: { id: context.projectId },
          data: { taskCounter: { increment: 1 } },
          select: { key: true, taskCounter: true },
        });

        const rank = await this.resolveRank(
          tx,
          input.columnId,
          input.beforeTaskId,
          input.afterTaskId,
        );

        return tx.task.create({
          data: {
            workspaceId,
            projectId: context.projectId,
            boardId: column.boardId,
            columnId: column.id,
            key: `${project.key}-${project.taskCounter}`,
            number: project.taskCounter,
            title: input.title,
            description: input.description ?? null,
            priority: input.priority,
            rank,
            dueDate: input.dueDate ? new Date(input.dueDate) : null,
            estimate: input.estimate ?? null,
            storyPoints: input.storyPoints ?? null,
            creatorId: userId,
            completedAt: column.isDone ? new Date() : null,
            assignees: { create: input.assigneeIds.map((assigneeId) => ({ userId: assigneeId })) },
            labels: { create: input.labelIds.map((labelId) => ({ labelId })) },
          },
          select: TASK_SUMMARY_SELECT,
        });
      }),
    );

    const [summary] = await this.mapper.toSummaries([task]);

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskId: task.id,
      taskKey: task.key,
      type: 'TASK_CREATED',
    });

    await this.realtime.emitToBoard(
      column.boardId,
      'task.created',
      { task: summary as TaskSummary },
      { actorId: userId, exceptSocketId: socketId },
    );

    await this.notifyAssigned(
      workspaceId,
      userId,
      task.id,
      task.key,
      task.title,
      column.boardId,
      input.assigneeIds,
    );

    return summary as TaskSummary;
  }

  async update(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: UpdateTaskInput,
    socketId?: string | null,
  ): Promise<TaskSummary> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');
    this.access.assert(context.role, 'task:update');

    const previous = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: {
        title: true,
        priority: true,
        dueDate: true,
        boardId: true,
        assignees: { select: { userId: true } },
        labels: { select: { labelId: true } },
      },
    });

    if (input.assigneeIds) await this.assertAssigneesBelong(workspaceId, input.assigneeIds);
    if (input.labelIds) await this.assertLabelsBelong(workspaceId, input.labelIds);

    const previousAssignees = new Set(previous.assignees.map((assignee) => assignee.userId));
    const nextAssignees = new Set(input.assigneeIds ?? [...previousAssignees]);
    const addedAssignees = [...nextAssignees].filter((id) => !previousAssignees.has(id));
    const removedAssignees = [...previousAssignees].filter((id) => !nextAssignees.has(id));

    const previousLabels = new Set(previous.labels.map((label) => label.labelId));
    const nextLabels = new Set(input.labelIds ?? [...previousLabels]);

    const task = await this.prisma.$transaction(async (tx) => {
      // Only the fields present in the request are touched, so two people editing
      // different fields of the same task do not overwrite one another.
      await tx.task.update({
        where: { id: taskId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.dueDate !== undefined
            ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
            : {}),
          ...(input.estimate !== undefined ? { estimate: input.estimate } : {}),
          ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
        },
      });

      if (input.assigneeIds) {
        if (removedAssignees.length > 0) {
          await tx.taskAssignee.deleteMany({
            where: { taskId, userId: { in: removedAssignees } },
          });
        }
        if (addedAssignees.length > 0) {
          await tx.taskAssignee.createMany({
            data: addedAssignees.map((assigneeId) => ({ taskId, userId: assigneeId })),
            skipDuplicates: true,
          });
        }
      }

      if (input.labelIds) {
        const removedLabels = [...previousLabels].filter((id) => !nextLabels.has(id));
        const addedLabels = [...nextLabels].filter((id) => !previousLabels.has(id));
        if (removedLabels.length > 0) {
          await tx.taskLabel.deleteMany({ where: { taskId, labelId: { in: removedLabels } } });
        }
        if (addedLabels.length > 0) {
          await tx.taskLabel.createMany({
            data: addedLabels.map((labelId) => ({ taskId, labelId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.task.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SUMMARY_SELECT });
    });

    const [summary] = await this.mapper.toSummaries([task]);

    await this.recordUpdateActivity(
      workspaceId,
      userId,
      context,
      previous,
      input,
      addedAssignees,
      removedAssignees,
    );

    await this.realtime.emitToBoard(
      previous.boardId,
      'task.updated',
      { task: summary as TaskSummary },
      { actorId: userId, exceptSocketId: socketId },
    );

    await this.notifyAssigned(
      workspaceId,
      userId,
      taskId,
      context.taskKey,
      task.title,
      previous.boardId,
      addedAssignees,
    );

    return summary as TaskSummary;
  }

  /**
   * Moves a task between (or inside) columns.
   *
   * The client sends the neighbours it dropped between, never a rank. The server
   * resolves those neighbours and computes the rank inside a transaction, so two
   * people dropping onto the same slot at the same moment produce two distinct,
   * well-ordered ranks instead of a collision.
   */
  async move(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: MoveTaskInput,
    socketId?: string | null,
  ): Promise<TaskSummary> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');
    this.access.assert(context.role, 'task:update');

    const [current, destination] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: {
          columnId: true,
          boardId: true,
          key: true,
          title: true,
          completedAt: true,
          column: { select: { name: true } },
          assignees: { select: { userId: true } },
        },
      }),
      this.prisma.boardColumn.findUnique({
        where: { id: input.columnId },
        select: { id: true, name: true, boardId: true, isDone: true },
      }),
    ]);

    if (!destination) throw AppException.notFound('Column not found');
    if (destination.boardId !== current.boardId) {
      throw AppException.validation('Tasks can only be moved between columns of the same board');
    }

    let rebalanced = false;

    const task = await this.withRankRetry(() =>
      this.prisma.$transaction(async (tx) => {
        let rank = await this.resolveRank(
          tx,
          input.columnId,
          input.beforeTaskId,
          input.afterTaskId,
          taskId,
        );

        // Ranks only grow when cards are repeatedly dropped into the same gap.
        // When one gets long enough to matter, the whole column is rewritten to
        // short values and subscribers are told to resynchronise.
        if (needsRebalance(rank)) {
          await this.rebalanceColumn(tx, input.columnId);
          rebalanced = true;
          rank = await this.resolveRank(
            tx,
            input.columnId,
            input.beforeTaskId,
            input.afterTaskId,
            taskId,
          );
        }

        return tx.task.update({
          where: { id: taskId },
          data: {
            columnId: destination.id,
            rank,
            completedAt: destination.isDone ? (current.completedAt ?? new Date()) : null,
          },
          select: TASK_SUMMARY_SELECT,
        });
      }),
    );

    const [summary] = await this.mapper.toSummaries([task]);

    if (current.columnId !== destination.id) {
      await this.activity.record({
        workspaceId,
        actorId: userId,
        projectId: context.projectId,
        taskId,
        taskKey: current.key,
        type: 'TASK_MOVED',
        metadata: { from: current.column.name, to: destination.name },
      });

      const shouldNotify = destination.isDone !== (current.completedAt !== null);
      if (shouldNotify) {
        await this.notifications.createMany(
          current.assignees.map((assignee) => ({
            workspaceId,
            userId: assignee.userId,
            actorId: userId,
            taskId,
            type: 'STATUS_CHANGE' as const,
            title: `${current.key} moved to ${destination.name}`,
            body: truncate(current.title, 120),
            link: this.taskLink(workspaceId, current.boardId, taskId),
          })),
        );
      }
    }

    await this.realtime.emitToBoard(
      current.boardId,
      'task.moved',
      {
        task: summary as TaskSummary,
        fromColumnId: current.columnId,
        toColumnId: destination.id,
      },
      { actorId: userId, exceptSocketId: socketId },
    );

    // A rebalance rewrote every rank in the column, which no incremental patch
    // can express — subscribers refetch the board instead.
    if (rebalanced) {
      const board = await this.prisma.board.findUniqueOrThrow({
        where: { id: current.boardId },
        select: {
          id: true,
          name: true,
          projectId: true,
          isDefault: true,
          rank: true,
          createdAt: true,
        },
      });
      await this.realtime.emitToBoard(current.boardId, 'board.updated', {
        board: { ...board, createdAt: board.createdAt.toISOString() },
        requiresResync: true,
      });
    }

    return summary as TaskSummary;
  }

  async remove(
    userId: string,
    workspaceId: string,
    taskId: string,
    socketId?: string | null,
  ): Promise<void> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');

    const task = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { creatorId: true, key: true, boardId: true, columnId: true },
    });

    // Members may delete their own tasks; deleting anyone else's needs elevation.
    if (task.creatorId !== userId) {
      this.access.assert(context.role, 'task:delete_any', 'You can only delete tasks you created');
    } else {
      this.access.assert(context.role, 'task:update');
    }

    await this.prisma.task.delete({ where: { id: taskId } });

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskKey: task.key,
      type: 'TASK_DELETED',
    });

    await this.realtime.emitToBoard(
      task.boardId,
      'task.deleted',
      { taskId, columnId: task.columnId, boardId: task.boardId },
      { actorId: userId, exceptSocketId: socketId },
    );
  }

  // -------------------------------------------------------------------------
  // Subtasks
  // -------------------------------------------------------------------------

  async createSubtask(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: CreateSubtaskInput,
    socketId?: string | null,
  ): Promise<SubtaskView> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');
    this.access.assert(context.role, 'task:update');

    const last = await this.prisma.subtask.findFirst({
      where: { taskId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });

    const subtask = await this.prisma.subtask.create({
      data: { taskId, title: input.title, rank: rankBetween(last?.rank ?? '', '') },
      select: { id: true, title: true, completed: true, rank: true, createdAt: true },
    });

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskId,
      taskKey: context.taskKey,
      type: 'SUBTASK_CREATED',
    });

    await this.emitTaskUpdated(context.boardId, taskId, userId, socketId);

    return { ...subtask, createdAt: subtask.createdAt.toISOString() };
  }

  async updateSubtask(
    userId: string,
    workspaceId: string,
    subtaskId: string,
    input: UpdateSubtaskInput,
    socketId?: string | null,
  ): Promise<SubtaskView> {
    const existing = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      select: { id: true, taskId: true, completed: true },
    });
    if (!existing) throw AppException.notFound('Subtask not found');

    const context = await this.access.requireTask(userId, existing.taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Subtask not found');
    this.access.assert(context.role, 'task:update');

    const subtask = await this.prisma.subtask.update({
      where: { id: subtaskId },
      data: input,
      select: { id: true, title: true, completed: true, rank: true, createdAt: true },
    });

    if (input.completed && !existing.completed) {
      await this.activity.record({
        workspaceId,
        actorId: userId,
        projectId: context.projectId,
        taskId: existing.taskId,
        taskKey: context.taskKey,
        type: 'SUBTASK_COMPLETED',
      });
    }

    await this.emitTaskUpdated(context.boardId, existing.taskId, userId, socketId);

    return { ...subtask, createdAt: subtask.createdAt.toISOString() };
  }

  async deleteSubtask(
    userId: string,
    workspaceId: string,
    subtaskId: string,
    socketId?: string | null,
  ): Promise<void> {
    const existing = await this.prisma.subtask.findUnique({
      where: { id: subtaskId },
      select: { taskId: true },
    });
    if (!existing) throw AppException.notFound('Subtask not found');

    const context = await this.access.requireTask(userId, existing.taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Subtask not found');
    this.access.assert(context.role, 'task:update');

    await this.prisma.subtask.delete({ where: { id: subtaskId } });
    await this.emitTaskUpdated(context.boardId, existing.taskId, userId, socketId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private visibilityFilter(role: Parameters<typeof can>[0], userId: string): Prisma.TaskWhereInput {
    if (can(role, 'project:view_all')) return {};
    return { project: { members: { some: { userId } } } };
  }

  private searchFilter(search: string): Prisma.TaskWhereInput[] {
    return [
      { title: { contains: search, mode: 'insensitive' } },
      { key: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  /**
   * Resolves the rank for a drop position.
   *
   * The client names the neighbours it dropped between, but only one of them is
   * used as an anchor — the opposite bound is re-read from the database. That
   * matters under concurrency: if someone else has already landed a card in the
   * same gap, the anchor's *current* neighbour is that new card, so the retry
   * below lands between the two rather than recomputing the identical midpoint
   * and colliding forever.
   */
  private async resolveRank(
    client: Prisma.TransactionClient | PrismaService,
    columnId: string,
    beforeTaskId?: string | null,
    afterTaskId?: string | null,
    excludeTaskId?: string,
  ): Promise<string> {
    const exclude = excludeTaskId ? { NOT: { id: excludeTaskId } } : {};

    if (beforeTaskId) {
      const before = await client.task.findFirst({
        where: { id: beforeTaskId, columnId, ...exclude },
        select: { rank: true },
      });
      if (before) {
        const next = await client.task.findFirst({
          where: { columnId, rank: { gt: before.rank }, ...exclude },
          orderBy: { rank: 'asc' },
          select: { rank: true },
        });
        return rankBetween(before.rank, next?.rank ?? '');
      }
    }

    if (afterTaskId) {
      const after = await client.task.findFirst({
        where: { id: afterTaskId, columnId, ...exclude },
        select: { rank: true },
      });
      if (after) {
        const previous = await client.task.findFirst({
          where: { columnId, rank: { lt: after.rank }, ...exclude },
          orderBy: { rank: 'desc' },
          select: { rank: true },
        });
        return rankBetween(previous?.rank ?? '', after.rank);
      }
    }

    // No usable neighbour: append to the end of the column.
    const last = await client.task.findFirst({
      where: { columnId, ...exclude },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    return rankBetween(last?.rank ?? '', '');
  }

  /**
   * Retries a transaction that lost a race for a rank.
   *
   * The retry has to wrap the **whole** transaction: once a statement fails inside
   * a Postgres transaction the transaction is aborted, so retrying in place would
   * only produce "current transaction is aborted" errors. Re-running it re-reads
   * the neighbours, which is exactly what makes the second attempt succeed.
   */
  private async withRankRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isRankCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          String(error.meta?.target ?? '').includes('rank');

        if (!isRankCollision || attempt >= RANK_RETRY_LIMIT) throw error;
        this.logger.debug({ attempt }, 'Rank collision — recomputing against current neighbours');
      }
    }
  }

  /**
   * Rewrites a column's ranks to short evenly spread values.
   *
   * Done in two passes through a namespace no generated rank can occupy (`~`),
   * because a single-pass rewrite would transiently violate the
   * `@@unique([columnId, rank])` constraint.
   */
  private async rebalanceColumn(tx: Prisma.TransactionClient, columnId: string): Promise<void> {
    const tasks = await tx.task.findMany({
      where: { columnId },
      select: { id: true },
      orderBy: { rank: 'asc' },
    });
    if (tasks.length === 0) return;

    this.logger.log({ columnId, tasks: tasks.length }, 'Rebalancing column ranks');

    for (const task of tasks) {
      await tx.task.update({ where: { id: task.id }, data: { rank: `~${task.id}` } });
    }

    const ranks = generateRanks(tasks.length);
    for (const [index, task] of tasks.entries()) {
      await tx.task.update({ where: { id: task.id }, data: { rank: ranks[index] as string } });
    }
  }

  private async assertAssigneesBelong(workspaceId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const unique = [...new Set(userIds)];
    const count = await this.prisma.workspaceMember.count({
      where: { workspaceId, userId: { in: unique } },
    });
    if (count !== unique.length) {
      throw AppException.validation('One or more assignees are not members of this workspace');
    }
  }

  private async assertLabelsBelong(workspaceId: string, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) return;
    const unique = [...new Set(labelIds)];
    const count = await this.prisma.label.count({ where: { workspaceId, id: { in: unique } } });
    if (count !== unique.length) {
      throw AppException.validation('One or more labels do not belong to this workspace');
    }
  }

  private taskLink(workspaceId: string, boardId: string, taskId: string): string {
    return `/app/${workspaceId}/boards/${boardId}?task=${taskId}`;
  }

  private async notifyAssigned(
    workspaceId: string,
    actorId: string,
    taskId: string,
    taskKey: string,
    title: string,
    boardId: string,
    assigneeIds: string[],
  ): Promise<void> {
    if (assigneeIds.length === 0) return;
    await this.notifications.createMany(
      assigneeIds.map((userId) => ({
        workspaceId,
        userId,
        actorId,
        taskId,
        type: 'TASK_ASSIGNED' as const,
        title: `You were assigned ${taskKey}`,
        body: truncate(title, 120),
        link: this.taskLink(workspaceId, boardId, taskId),
      })),
    );
  }

  private async emitTaskUpdated(
    boardId: string,
    taskId: string,
    actorId: string,
    socketId?: string | null,
  ): Promise<void> {
    const summary = await this.mapper.summaryById(taskId);
    await this.realtime.emitToBoard(
      boardId,
      'task.updated',
      { task: summary },
      { actorId, exceptSocketId: socketId },
    );
  }

  private async recordUpdateActivity(
    workspaceId: string,
    userId: string,
    context: { projectId: string; taskKey: string },
    previous: { priority: string; dueDate: Date | null; title: string },
    input: UpdateTaskInput,
    addedAssignees: string[],
    removedAssignees: string[],
  ): Promise<void> {
    const base = {
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskKey: context.taskKey,
    };

    if (input.priority && input.priority !== previous.priority) {
      await this.activity.record({
        ...base,
        type: 'TASK_PRIORITY_CHANGED',
        metadata: {
          from: TASK_PRIORITY_LABELS[previous.priority as keyof typeof TASK_PRIORITY_LABELS],
          to: TASK_PRIORITY_LABELS[input.priority],
        },
      });
    }

    if (input.dueDate !== undefined) {
      await this.activity.record({
        ...base,
        type: 'TASK_DUE_DATE_CHANGED',
        metadata: { to: input.dueDate ? new Date(input.dueDate).toDateString() : null },
      });
    }

    if (addedAssignees.length > 0 || removedAssignees.length > 0) {
      const names = await this.prisma.user.findMany({
        where: { id: { in: [...addedAssignees, ...removedAssignees] } },
        select: { id: true, name: true },
      });
      const nameById = new Map(names.map((user) => [user.id, user.name]));

      for (const assigneeId of addedAssignees) {
        await this.activity.record({
          ...base,
          type: 'TASK_ASSIGNED',
          metadata: { assigneeName: nameById.get(assigneeId) ?? 'someone' },
        });
      }
      for (const assigneeId of removedAssignees) {
        await this.activity.record({
          ...base,
          type: 'TASK_UNASSIGNED',
          metadata: { assigneeName: nameById.get(assigneeId) ?? 'someone' },
        });
      }
    }

    const onlyMetadataChanged =
      input.priority !== undefined ||
      input.dueDate !== undefined ||
      input.assigneeIds !== undefined;

    if (!onlyMetadataChanged) {
      await this.activity.record({ ...base, type: 'TASK_UPDATED' });
    }
  }
}
