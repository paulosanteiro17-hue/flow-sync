import { Injectable } from '@nestjs/common';
import type { NotificationType, NotificationView, NotificationsQuery } from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { cursorFilter, decodeCursor, toCursorPage, type CursorPage } from '../common/pagination';

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string;
  actorId?: string | null;
  taskId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

type NotificationRow = Prisma.NotificationGetPayload<{
  include: {
    actor: { select: { id: true; name: true; avatarUrl: true } };
    task: { select: { key: true } };
  };
}>;

/** Preference flags that gate each notification type. */
const PREFERENCE_BY_TYPE: Record<NotificationType, keyof PreferenceFlags | null> = {
  TASK_ASSIGNED: 'notifyOnAssignment',
  MENTION: 'notifyOnMention',
  COMMENT: 'notifyOnComment',
  DUE_SOON: 'notifyOnDueSoon',
  STATUS_CHANGE: null,
  INVITATION: null,
};

interface PreferenceFlags {
  notifyOnAssignment: boolean;
  notifyOnMention: boolean;
  notifyOnComment: boolean;
  notifyOnDueSoon: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly access: AccessService,
  ) {}

  /**
   * Creates notifications and pushes them down each recipient's personal socket
   * room, so a badge updates wherever the user happens to be in the app.
   *
   * Self-notifications are dropped (you do not need telling that you assigned
   * yourself), and per-user preferences are honoured.
   */
  async createMany(inputs: CreateNotificationInput[]): Promise<void> {
    const relevant = inputs.filter((input) => input.userId !== input.actorId);
    if (relevant.length === 0) return;

    const recipients = [...new Set(relevant.map((input) => input.userId))];
    const preferences = await this.prisma.userPreference.findMany({
      where: { userId: { in: recipients } },
      select: {
        userId: true,
        notifyOnAssignment: true,
        notifyOnMention: true,
        notifyOnComment: true,
        notifyOnDueSoon: true,
      },
    });
    const preferenceByUser = new Map(preferences.map((preference) => [preference.userId, preference]));

    const allowed = relevant.filter((input) => {
      const flag = PREFERENCE_BY_TYPE[input.type];
      if (!flag) return true;
      const preference = preferenceByUser.get(input.userId);
      return preference ? preference[flag] : true;
    });

    if (allowed.length === 0) return;

    const created = await this.prisma.$transaction(
      allowed.map((input) =>
        this.prisma.notification.create({
          data: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            actorId: input.actorId ?? null,
            taskId: input.taskId ?? null,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
          },
          include: {
            actor: { select: { id: true, name: true, avatarUrl: true } },
            task: { select: { key: true } },
          },
        }),
      ),
    );

    const unreadCounts = new Map<string, number>();
    for (const userId of new Set(created.map((row) => row.userId))) {
      unreadCounts.set(userId, await this.unreadCount(userId));
    }

    await Promise.all(
      created.map((row) =>
        this.realtime.emitToUser(
          row.userId,
          'notification.created',
          { notification: this.toView(row), unreadCount: unreadCounts.get(row.userId) ?? 0 },
          { actorId: row.actorId },
        ),
      ),
    );
  }

  create(input: CreateNotificationInput): Promise<void> {
    return this.createMany([input]);
  }

  async list(
    userId: string,
    workspaceId: string,
    query: NotificationsQuery,
  ): Promise<CursorPage<NotificationView> & { unreadCount: number }> {
    await this.access.requireWorkspace(userId, workspaceId);
    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        workspaceId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...cursorFilter(cursor),
      },
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { key: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const page = toCursorPage(rows, query.limit, (row) => this.toView(row));
    return { ...page, unreadCount: await this.unreadCount(userId, workspaceId) };
  }

  async unreadCount(userId: string, workspaceId?: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, ...(workspaceId ? { workspaceId } : {}) },
    });
  }

  async markRead(userId: string, workspaceId: string, ids: string[]): Promise<{ unreadCount: number }> {
    await this.access.requireWorkspace(userId, workspaceId);
    // Scoping the update by userId means one member can never mark another's notifications.
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId, workspaceId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unreadCount: await this.unreadCount(userId, workspaceId) };
  }

  async markAllRead(userId: string, workspaceId: string): Promise<{ unreadCount: number }> {
    await this.access.requireWorkspace(userId, workspaceId);
    await this.prisma.notification.updateMany({
      where: { userId, workspaceId, readAt: null },
      data: { readAt: new Date() },
    });
    return { unreadCount: 0 };
  }

  async remove(userId: string, workspaceId: string, id: string): Promise<void> {
    await this.access.requireWorkspace(userId, workspaceId);
    const result = await this.prisma.notification.deleteMany({ where: { id, userId, workspaceId } });
    if (result.count === 0) throw AppException.notFound('Notification not found');
  }

  private toView(row: NotificationRow): NotificationView {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor ? { id: row.actor.id, name: row.actor.name, avatarUrl: row.actor.avatarUrl } : null,
      link: row.link,
      taskKey: row.task?.key ?? null,
    };
  }
}
