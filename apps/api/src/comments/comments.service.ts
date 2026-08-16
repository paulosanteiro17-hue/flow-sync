import { Injectable } from '@nestjs/common';
import {
  extractMentionIds,
  stripMentionMarkup,
  truncate,
  type CommentView,
  type CreateCommentInput,
  type CursorPaginationInput,
  type UpdateCommentInput,
} from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { TaskMapper } from '../common/task-mapper.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { cursorFilter, decodeCursor, toCursorPage, type CursorPage } from '../common/pagination';

const COMMENT_SELECT = {
  id: true,
  taskId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
  mentions: { select: { user: { select: { id: true, name: true, avatarUrl: true } } } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof COMMENT_SELECT }>;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly mapper: TaskMapper,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
    taskId: string,
    pagination: CursorPaginationInput,
  ): Promise<CursorPage<CommentView>> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');

    const cursor = decodeCursor(pagination.cursor);
    const rows = await this.prisma.comment.findMany({
      where: { taskId, ...cursorFilter(cursor) },
      select: COMMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });

    return toCursorPage(rows, pagination.limit, (row) => this.toView(row));
  }

  async create(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: CreateCommentInput,
    socketId?: string | null,
  ): Promise<CommentView> {
    const context = await this.access.requireTask(userId, taskId);
    if (context.workspaceId !== workspaceId) throw AppException.notFound('Task not found');
    this.access.assert(context.role, 'comment:create');

    // Mentions come from the markup in the body, not from the client's list — the
    // list is only a hint and could otherwise be used to spam arbitrary users.
    const mentionedIds = await this.resolveMentions(workspaceId, input.body);

    const comment = await this.prisma.comment.create({
      data: {
        workspaceId,
        taskId,
        authorId: userId,
        body: input.body,
        mentions: { create: mentionedIds.map((mentionedId) => ({ userId: mentionedId })) },
      },
      select: COMMENT_SELECT,
    });

    const view = this.toView(comment);

    await this.activity.record({
      workspaceId,
      actorId: userId,
      projectId: context.projectId,
      taskId,
      taskKey: context.taskKey,
      type: 'COMMENT_CREATED',
    });

    await this.realtime.emitToBoard(
      context.boardId,
      'comment.created',
      { comment: view },
      { actorId: userId, exceptSocketId: socketId },
    );
    await this.emitTaskCounts(context.boardId, taskId, userId);

    await this.fanOutNotifications(workspaceId, userId, context, input.body, mentionedIds);

    return view;
  }

  async update(
    userId: string,
    workspaceId: string,
    commentId: string,
    input: UpdateCommentInput,
    socketId?: string | null,
  ): Promise<CommentView> {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, taskId: true, authorId: true, workspaceId: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw AppException.notFound('Comment not found');
    }

    const context = await this.access.requireTask(userId, existing.taskId);

    // Editing is author-only; even an owner cannot rewrite someone else's words.
    if (existing.authorId !== userId) {
      throw AppException.forbidden('You can only edit your own comments');
    }

    const mentionedIds = await this.resolveMentions(workspaceId, input.body);

    const comment = await this.prisma.$transaction(async (tx) => {
      await tx.commentMention.deleteMany({ where: { commentId } });
      return tx.comment.update({
        where: { id: commentId },
        data: {
          body: input.body,
          editedAt: new Date(),
          mentions: { create: mentionedIds.map((mentionedId) => ({ userId: mentionedId })) },
        },
        select: COMMENT_SELECT,
      });
    });

    const view = this.toView(comment);
    await this.realtime.emitToBoard(
      context.boardId,
      'comment.updated',
      { comment: view },
      { actorId: userId, exceptSocketId: socketId },
    );

    return view;
  }

  async remove(
    userId: string,
    workspaceId: string,
    commentId: string,
    socketId?: string | null,
  ): Promise<void> {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, taskId: true, authorId: true, workspaceId: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
      throw AppException.notFound('Comment not found');
    }

    const context = await this.access.requireTask(userId, existing.taskId);

    if (existing.authorId !== userId) {
      this.access.assert(
        context.role,
        'comment:delete_any',
        'You can only delete your own comments',
      );
    }

    await this.prisma.comment.delete({ where: { id: commentId } });

    await this.realtime.emitToBoard(
      context.boardId,
      'comment.deleted',
      { commentId, taskId: existing.taskId },
      { actorId: userId, exceptSocketId: socketId },
    );
    await this.emitTaskCounts(context.boardId, existing.taskId, userId);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Keeps only mentions of people who are actually members of this workspace. */
  private async resolveMentions(workspaceId: string, body: string): Promise<string[]> {
    const candidates = extractMentionIds(body);
    if (candidates.length === 0) return [];

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, userId: { in: candidates } },
      select: { userId: true },
    });
    return members.map((member) => member.userId);
  }

  private async fanOutNotifications(
    workspaceId: string,
    actorId: string,
    context: { taskId: string; taskKey: string; boardId: string },
    body: string,
    mentionedIds: string[],
  ): Promise<void> {
    const excerpt = truncate(stripMentionMarkup(body), 140);
    const link = `/app/${workspaceId}/boards/${context.boardId}?task=${context.taskId}`;

    const mentionNotifications = mentionedIds.map((userId) => ({
      workspaceId,
      userId,
      actorId,
      taskId: context.taskId,
      type: 'MENTION' as const,
      title: `You were mentioned in ${context.taskKey}`,
      body: excerpt,
      link,
    }));

    // Assignees hear about the comment, unless they were already mentioned.
    const assignees = await this.prisma.taskAssignee.findMany({
      where: { taskId: context.taskId, userId: { notIn: [...mentionedIds, actorId] } },
      select: { userId: true },
    });

    const commentNotifications = assignees.map((assignee) => ({
      workspaceId,
      userId: assignee.userId,
      actorId,
      taskId: context.taskId,
      type: 'COMMENT' as const,
      title: `New comment on ${context.taskKey}`,
      body: excerpt,
      link,
    }));

    await this.notifications.createMany([...mentionNotifications, ...commentNotifications]);
  }

  /**
   * The board card shows a comment count, so the card itself has to be refreshed.
   * This goes to everyone including the author — their own count changed too.
   */
  private async emitTaskCounts(boardId: string, taskId: string, actorId: string): Promise<void> {
    const exists = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!exists) return;
    const task = await this.mapper.summaryById(taskId);
    await this.realtime.emitToBoard(boardId, 'task.updated', { task }, { actorId });
  }

  private toView(row: CommentRow): CommentView {
    return {
      id: row.id,
      taskId: row.taskId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
      author: row.author,
      mentions: row.mentions.map((mention) => mention.user),
    };
  }
}
