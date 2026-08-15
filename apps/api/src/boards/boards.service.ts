import { Injectable } from '@nestjs/common';
import {
  DEFAULT_COLUMNS,
  generateRanks,
  rankBetween,
  rooms,
  type BoardColumnView,
  type BoardSnapshot,
  type BoardSummary,
  type CreateBoardInput,
  type CreateColumnInput,
  type MoveColumnInput,
  type UpdateBoardInput,
  type UpdateColumnInput,
} from '@flowsync/shared';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TASK_SUMMARY_SELECT, TaskMapper } from '../common/task-mapper.service';
import { ActivityService } from '../activity/activity.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ProjectsService } from '../projects/projects.service';

const COLUMN_SELECT = {
  id: true,
  name: true,
  color: true,
  rank: true,
  boardId: true,
  wipLimit: true,
  isDone: true,
} as const;

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
    private readonly tasks: TaskMapper,
    private readonly projects: ProjectsService,
  ) {}

  async listForProject(userId: string, projectId: string): Promise<BoardSummary[]> {
    await this.access.requireProject(userId, projectId);
    const boards = await this.prisma.board.findMany({
      where: { projectId },
      select: { id: true, name: true, projectId: true, isDefault: true, rank: true, createdAt: true },
      orderBy: { rank: 'asc' },
    });
    return boards.map((board) => ({ ...board, createdAt: board.createdAt.toISOString() }));
  }

  async create(userId: string, projectId: string, input: CreateBoardInput): Promise<BoardSummary> {
    const context = await this.access.requireProject(userId, projectId);

    const last = await this.prisma.board.findFirst({
      where: { projectId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });

    const columnRanks = generateRanks(DEFAULT_COLUMNS.length);

    const board = await this.prisma.board.create({
      data: {
        projectId,
        name: input.name,
        rank: rankBetween(last?.rank ?? '', ''),
        ...(input.withDefaultColumns
          ? {
              columns: {
                create: DEFAULT_COLUMNS.map((column, index) => ({
                  name: column.name,
                  color: column.color,
                  rank: columnRanks[index] as string,
                  isDone: column.name === 'Done',
                })),
              },
            }
          : {}),
      },
      select: { id: true, name: true, projectId: true, isDefault: true, rank: true, createdAt: true },
    });

    const summary: BoardSummary = { ...board, createdAt: board.createdAt.toISOString() };

    await this.activity.record({
      workspaceId: context.workspaceId,
      actorId: userId,
      projectId,
      type: 'BOARD_CREATED',
      metadata: { boardName: board.name },
    });

    await this.realtime.emitToProject(projectId, 'board.created', { board: summary }, { actorId: userId });
    return summary;
  }

  /**
   * The board snapshot the client hydrates from. It carries the realtime `seq` at
   * the moment it was taken, so the socket layer knows exactly which events it
   * still needs and can detect a gap.
   */
  async snapshot(userId: string, workspaceId: string, boardId: string): Promise<BoardSnapshot> {
    const context = await this.access.requireBoard(userId, boardId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Board not found');

    const board = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      select: {
        id: true,
        name: true,
        projectId: true,
        isDefault: true,
        rank: true,
        createdAt: true,
        columns: { select: COLUMN_SELECT, orderBy: { rank: 'asc' } },
      },
    });

    const taskRows = await this.prisma.task.findMany({
      where: { boardId },
      select: TASK_SUMMARY_SELECT,
      orderBy: { rank: 'asc' },
    });

    const project = await this.projects.summaryById(userId, board.projectId);

    return {
      board: { ...board, createdAt: board.createdAt.toISOString() },
      project,
      columns: board.columns,
      tasks: await this.tasks.toSummaries(taskRows),
      seq: await this.realtime.currentSequence(rooms.board(boardId)),
    };
  }

  async update(
    userId: string,
    workspaceId: string,
    boardId: string,
    input: UpdateBoardInput,
  ): Promise<BoardSummary> {
    const context = await this.access.requireBoard(userId, boardId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Board not found');

    const previous = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { name: true },
    });

    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: input,
      select: { id: true, name: true, projectId: true, isDefault: true, rank: true, createdAt: true },
    });

    const summary: BoardSummary = { ...board, createdAt: board.createdAt.toISOString() };

    if (input.name && input.name !== previous.name) {
      await this.activity.record({
        workspaceId: context.workspaceId,
        actorId: userId,
        projectId: context.projectId,
        type: 'BOARD_UPDATED',
        metadata: { from: previous.name, to: input.name },
      });
    }

    await this.realtime.emitToBoard(
      boardId,
      'board.updated',
      { board: summary, requiresResync: false },
      { actorId: userId },
    );

    return summary;
  }

  async remove(userId: string, workspaceId: string, boardId: string): Promise<void> {
    const context = await this.access.requireBoard(userId, boardId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Board not found');

    const count = await this.prisma.board.count({ where: { projectId: context.projectId } });
    if (count <= 1) {
      throw AppException.conflict('A project must keep at least one board');
    }

    await this.prisma.board.delete({ where: { id: boardId } });
    await this.realtime.emitToProject(
      context.projectId,
      'board.deleted',
      { boardId, projectId: context.projectId },
      { actorId: userId },
    );
  }

  // -------------------------------------------------------------------------
  // Columns
  // -------------------------------------------------------------------------

  async createColumn(
    userId: string,
    workspaceId: string,
    boardId: string,
    input: CreateColumnInput,
    socketId?: string | null,
  ): Promise<BoardColumnView> {
    const context = await this.access.requireBoard(userId, boardId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Board not found');

    const rank = await this.rankAfterColumn(boardId, input.afterColumnId ?? null);

    const column = await this.prisma.boardColumn.create({
      data: {
        boardId,
        name: input.name,
        color: input.color,
        rank,
        wipLimit: input.wipLimit ?? null,
        isDone: input.isDone,
      },
      select: COLUMN_SELECT,
    });

    await this.activity.record({
      workspaceId: context.workspaceId,
      actorId: userId,
      projectId: context.projectId,
      type: 'COLUMN_CREATED',
      metadata: { columnName: column.name },
    });

    await this.realtime.emitToBoard(
      boardId,
      'column.created',
      { column },
      { actorId: userId, exceptSocketId: socketId },
    );

    return column;
  }

  async updateColumn(
    userId: string,
    workspaceId: string,
    columnId: string,
    input: UpdateColumnInput,
    socketId?: string | null,
  ): Promise<BoardColumnView> {
    const { context, column: previous } = await this.requireColumn(userId, workspaceId, columnId);

    const column = await this.prisma.boardColumn.update({
      where: { id: columnId },
      data: input,
      select: COLUMN_SELECT,
    });

    // Flipping the "done" flag changes what counts as completed for every task in it.
    if (input.isDone !== undefined && input.isDone !== previous.isDone) {
      await this.prisma.task.updateMany({
        where: { columnId },
        data: { completedAt: input.isDone ? new Date() : null },
      });
    }

    if (input.name && input.name !== previous.name) {
      await this.activity.record({
        workspaceId: context.workspaceId,
        actorId: userId,
        projectId: context.projectId,
        type: 'COLUMN_UPDATED',
        metadata: { from: previous.name, to: input.name },
      });
    }

    await this.realtime.emitToBoard(
      column.boardId,
      'column.updated',
      { column },
      { actorId: userId, exceptSocketId: socketId },
    );

    // Task completion changed underneath the client, so ask it to resynchronise.
    if (input.isDone !== undefined && input.isDone !== previous.isDone) {
      await this.emitResync(column.boardId, userId);
    }

    return column;
  }

  async moveColumn(
    userId: string,
    workspaceId: string,
    columnId: string,
    input: MoveColumnInput,
    socketId?: string | null,
  ): Promise<BoardColumnView> {
    const { column: current } = await this.requireColumn(userId, workspaceId, columnId);

    const [before, after] = await Promise.all([
      input.beforeColumnId
        ? this.prisma.boardColumn.findFirst({
            where: { id: input.beforeColumnId, boardId: current.boardId },
            select: { rank: true },
          })
        : Promise.resolve(null),
      input.afterColumnId
        ? this.prisma.boardColumn.findFirst({
            where: { id: input.afterColumnId, boardId: current.boardId },
            select: { rank: true },
          })
        : Promise.resolve(null),
    ]);

    const rank = rankBetween(before?.rank ?? '', after?.rank ?? '');

    const column = await this.prisma.boardColumn.update({
      where: { id: columnId },
      data: { rank },
      select: COLUMN_SELECT,
    });

    await this.realtime.emitToBoard(
      column.boardId,
      'column.moved',
      { column },
      { actorId: userId, exceptSocketId: socketId },
    );

    return column;
  }

  async deleteColumn(
    userId: string,
    workspaceId: string,
    columnId: string,
    moveTasksTo?: string,
    socketId?: string | null,
  ): Promise<void> {
    const { context, column } = await this.requireColumn(userId, workspaceId, columnId);

    const remaining = await this.prisma.boardColumn.count({ where: { boardId: column.boardId } });
    if (remaining <= 1) throw AppException.conflict('A board must keep at least one column');

    const taskCount = await this.prisma.task.count({ where: { columnId } });

    let target: string | null = null;
    if (taskCount > 0) {
      if (!moveTasksTo) {
        throw AppException.conflict(
          'This column still has tasks. Choose a column to move them to first.',
        );
      }
      const destination = await this.prisma.boardColumn.findFirst({
        where: { id: moveTasksTo, boardId: column.boardId },
        select: { id: true },
      });
      if (!destination) throw AppException.validation('The destination column is not on this board');
      target = destination.id;
    }

    await this.prisma.$transaction(async (tx) => {
      if (target) {
        // Re-rank the moved tasks so they land at the end of the destination in
        // their existing order, keeping the (columnId, rank) uniqueness intact.
        const moving = await tx.task.findMany({
          where: { columnId },
          select: { id: true },
          orderBy: { rank: 'asc' },
        });
        const last = await tx.task.findFirst({
          where: { columnId: target },
          orderBy: { rank: 'desc' },
          select: { rank: true },
        });

        let previousRank = last?.rank ?? '';
        for (const task of moving) {
          previousRank = rankBetween(previousRank, '');
          await tx.task.update({
            where: { id: task.id },
            data: { columnId: target, rank: previousRank },
          });
        }
      }
      await tx.boardColumn.delete({ where: { id: columnId } });
    });

    await this.activity.record({
      workspaceId: context.workspaceId,
      actorId: userId,
      projectId: context.projectId,
      type: 'COLUMN_DELETED',
      metadata: { columnName: column.name },
    });

    await this.realtime.emitToBoard(
      column.boardId,
      'column.deleted',
      { columnId, boardId: column.boardId, movedTasksToColumnId: target },
      { actorId: userId, exceptSocketId: socketId },
    );

    if (target) await this.emitResync(column.boardId, userId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireColumn(userId: string, workspaceId: string, columnId: string) {
    const column = await this.prisma.boardColumn.findUnique({
      where: { id: columnId },
      select: { ...COLUMN_SELECT, board: { select: { projectId: true } } },
    });
    if (!column) throw AppException.notFound('Column not found');

    const context = await this.access.requireProject(userId, column.board.projectId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Column not found');

    return { context, column };
  }

  private async rankAfterColumn(boardId: string, afterColumnId: string | null): Promise<string> {
    if (!afterColumnId) {
      const last = await this.prisma.boardColumn.findFirst({
        where: { boardId },
        orderBy: { rank: 'desc' },
        select: { rank: true },
      });
      return rankBetween(last?.rank ?? '', '');
    }

    const after = await this.prisma.boardColumn.findFirst({
      where: { id: afterColumnId, boardId },
      select: { rank: true },
    });
    if (!after) throw AppException.validation('The reference column is not on this board');

    const next = await this.prisma.boardColumn.findFirst({
      where: { boardId, rank: { gt: after.rank } },
      orderBy: { rank: 'asc' },
      select: { rank: true },
    });

    return rankBetween(after.rank, next?.rank ?? '');
  }

  /** Tells every subscriber that an incremental patch is not enough for this change. */
  private async emitResync(boardId: string, actorId: string): Promise<void> {
    const board = await this.prisma.board.findUniqueOrThrow({
      where: { id: boardId },
      select: { id: true, name: true, projectId: true, isDefault: true, rank: true, createdAt: true },
    });
    await this.realtime.emitToBoard(
      boardId,
      'board.updated',
      {
        board: { ...board, createdAt: board.createdAt.toISOString() },
        requiresResync: true,
      },
      { actorId },
    );
  }
}
