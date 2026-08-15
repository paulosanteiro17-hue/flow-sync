import { Injectable, Logger } from '@nestjs/common';
import {
  PRESENCE_BROADCAST_THROTTLE_MS,
  PRESENCE_TTL_MS,
  SERVER_EVENTS,
  rooms,
  type RealtimeEnvelope,
  type RealtimeEventPayloads,
  type RealtimeEventType,
} from '@flowsync/shared';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface EmitOptions {
  /** The socket that caused the change; it is skipped so its optimistic state survives. */
  exceptSocketId?: string | null;
  actorId?: string | null;
}

/**
 * Publishes domain events to rooms.
 *
 * Two properties make the client side simple:
 *   * every envelope carries a per-room monotonic `seq`, so a client can detect a
 *     gap and resynchronise instead of applying events out of order;
 *   * every envelope carries a unique `id`, so a client that receives the same
 *     event twice (reconnect races, multi-tab) can drop the duplicate.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;
  private readonly presenceThrottle = new Map<string, number>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /** Called by the gateway once Socket.IO is ready. */
  attachServer(server: Server): void {
    this.server = server;
  }

  get isAttached(): boolean {
    return this.server !== null;
  }

  async emit<T extends RealtimeEventType>(
    room: string,
    type: T,
    payload: RealtimeEventPayloads[T],
    options: EmitOptions = {},
  ): Promise<RealtimeEnvelope<T>> {
    const seq = await this.redis.nextSequence(room);
    const envelope: RealtimeEnvelope<T> = {
      id: randomUUID(),
      type,
      room,
      seq,
      ts: new Date().toISOString(),
      actorId: options.actorId ?? null,
      payload,
    };

    if (!this.server) {
      // Unit tests exercise services without a gateway; the sequence still advances.
      this.logger.debug(`No socket server attached, skipping broadcast of ${type}`);
      return envelope;
    }

    const target = options.exceptSocketId
      ? this.server.to(room).except(options.exceptSocketId)
      : this.server.to(room);

    target.emit(SERVER_EVENTS.event, envelope);
    return envelope;
  }

  /** Fan-out to a board and, when the change matters project-wide, to the project room too. */
  async emitToBoard<T extends RealtimeEventType>(
    boardId: string,
    type: T,
    payload: RealtimeEventPayloads[T],
    options: EmitOptions = {},
  ): Promise<void> {
    await this.emit(rooms.board(boardId), type, payload, options);
  }

  async emitToProject<T extends RealtimeEventType>(
    projectId: string,
    type: T,
    payload: RealtimeEventPayloads[T],
    options: EmitOptions = {},
  ): Promise<void> {
    await this.emit(rooms.project(projectId), type, payload, options);
  }

  async emitToWorkspace<T extends RealtimeEventType>(
    workspaceId: string,
    type: T,
    payload: RealtimeEventPayloads[T],
    options: EmitOptions = {},
  ): Promise<void> {
    await this.emit(rooms.workspace(workspaceId), type, payload, options);
  }

  /** Personal channel: notifications land here regardless of which page the user is on. */
  async emitToUser<T extends RealtimeEventType>(
    userId: string,
    type: T,
    payload: RealtimeEventPayloads[T],
    options: EmitOptions = {},
  ): Promise<void> {
    await this.emit(rooms.user(userId), type, payload, options);
  }

  currentSequence(room: string): Promise<number> {
    return this.redis.currentSequence(room);
  }

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  async heartbeat(room: string, userId: string): Promise<void> {
    await this.redis.touchPresence(room, userId, PRESENCE_TTL_MS);
    await this.broadcastPresence(room);
  }

  async leave(room: string, userId: string): Promise<void> {
    await this.redis.removePresence(room, userId);
    await this.broadcastPresence(room, true);
  }

  /**
   * Presence churns constantly (every heartbeat, every tab). Broadcasting each
   * change would flood the room, so emissions are coalesced to one per second.
   */
  async broadcastPresence(room: string, force = false): Promise<void> {
    const now = Date.now();
    const last = this.presenceThrottle.get(room) ?? 0;
    if (!force && now - last < PRESENCE_BROADCAST_THROTTLE_MS) return;
    this.presenceThrottle.set(room, now);

    const entries = await this.redis.listPresence(room, PRESENCE_TTL_MS);
    if (entries.length === 0) {
      await this.emit(room, 'presence.updated', { room, users: [] });
      return;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.userId) } },
      select: { id: true, name: true, avatarUrl: true },
    });

    const seenAt = new Map(entries.map((entry) => [entry.userId, entry.lastSeenMs]));
    await this.emit(room, 'presence.updated', {
      room,
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        lastSeenAt: new Date(seenAt.get(user.id) ?? Date.now()).toISOString(),
      })),
    });
  }

  async listPresence(room: string) {
    return this.redis.listPresence(room, PRESENCE_TTL_MS);
  }
}
