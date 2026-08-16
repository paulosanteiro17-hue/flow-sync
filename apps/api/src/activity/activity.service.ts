import { Injectable } from '@nestjs/common';
import {
  buildActivityMessage,
  type ActivityQuery,
  type ActivityType,
  type ActivityView,
} from '@flowsync/shared';
import type { Prisma } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { cursorFilter, decodeCursor, toCursorPage, type CursorPage } from '../common/pagination';

export interface RecordActivityInput {
  workspaceId: string;
  actorId: string;
  type: ActivityType;
  projectId?: string | null;
  taskId?: string | null;
  taskKey?: string | null;
  metadata?: Record<string, string | null>;
  /** Supplying the name avoids a lookup when the caller already has it. */
  actorName?: string;
  /** Transaction client, so the event is written atomically with the change it describes. */
  tx?: Prisma.TransactionClient;
}

type ActivityRow = Prisma.ActivityEventGetPayload<{
  include: {
    actor: { select: { id: true; name: true; avatarUrl: true } };
    task: { select: { key: true } };
  };
}>;

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /**
   * Writes one activity row. The rendered message is stored alongside the metadata
   * so the feed can be paginated and displayed without resolving names again.
   */
  async record(input: RecordActivityInput): Promise<void> {
    const client = input.tx ?? this.prisma;

    const actorName =
      input.actorName ??
      (
        await client.user.findUnique({
          where: { id: input.actorId },
          select: { name: true },
        })
      )?.name ??
      'Someone';

    const metadata = input.metadata ?? {};

    await client.activityEvent.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        actorId: input.actorId,
        type: input.type,
        metadata: metadata as Prisma.InputJsonValue,
        message: buildActivityMessage(input.type, {
          actorName,
          taskKey: input.taskKey ?? null,
          metadata,
        }),
      },
    });
  }

  async list(
    userId: string,
    workspaceId: string,
    query: ActivityQuery,
  ): Promise<CursorPage<ActivityView>> {
    await this.access.requireWorkspace(userId, workspaceId);

    // Scoping to a project or task requires access to that project.
    if (query.projectId) await this.access.requireProject(userId, query.projectId);
    if (query.taskId) await this.access.requireTask(userId, query.taskId);

    const cursor = decodeCursor(query.cursor);

    const rows = await this.prisma.activityEvent.findMany({
      where: {
        workspaceId,
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...cursorFilter(cursor),
      },
      include: {
        actor: { select: { id: true, name: true, avatarUrl: true } },
        task: { select: { key: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    return toCursorPage(rows, query.limit, (row) => this.toView(row));
  }

  private toView(row: ActivityRow): ActivityView {
    return {
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      actor: { id: row.actor.id, name: row.actor.name, avatarUrl: row.actor.avatarUrl },
      projectId: row.projectId,
      taskId: row.taskId,
      taskKey: row.task?.key ?? null,
      metadata: (row.metadata as Record<string, string | null>) ?? {},
      message: row.message,
    };
  }
}
