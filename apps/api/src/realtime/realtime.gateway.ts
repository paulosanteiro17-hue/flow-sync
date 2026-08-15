import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  CLIENT_EVENTS,
  COOKIE_NAMES,
  SERVER_EVENTS,
  rooms,
  type RealtimeErrorPayload,
  type SubscribeAck,
  type SubscribeRequest,
} from '@flowsync/shared';
import { createAdapter } from '@socket.io/redis-adapter';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { AccessService } from '../common/access.service';
import { TokenService } from '../common/token.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeService } from './realtime.service';

interface SocketState {
  userId: string;
  email: string;
  /** Rooms this socket has been authorised for, so unsubscribes and cleanup are exact. */
  subscribed: Set<string>;
}

const SUBSCRIBE_LIMIT_PER_SOCKET = 40;

/**
 * The realtime entry point.
 *
 * Security posture:
 *  * the handshake is authenticated from the same httpOnly cookie the REST API
 *    uses — no token in the query string, nothing readable by JavaScript;
 *  * the Origin header is checked against the CORS allowlist;
 *  * every `subscribe` re-validates access **in the database**. A client-supplied
 *    board id is a request, never a proof of entitlement.
 */
@WebSocketGateway({
  path: '/realtime',
  serveClient: false,
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly states = new WeakMap<Socket, SocketState>();

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly realtime: RealtimeService,
    private readonly redis: RedisService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  async afterInit(server: Server): Promise<void> {
    server.engine.opts.cors = {
      origin: this.config.webOrigins,
      credentials: true,
    };

    // Authentication runs as handshake middleware rather than in `handleConnection`.
    // Socket.IO completes the client-side `connect` event as soon as the handshake
    // succeeds, so a client can emit `subscribe` before an async connection handler
    // has finished — the socket would then have no resolved identity and every
    // subscription would be rejected as unauthenticated. Middleware closes that race:
    // nothing is delivered to a handler until `next()` has been called.
    server.use((socket, next) => {
      void this.authenticateHandshake(socket as Socket)
        .then(() => next())
        .catch((error: Error) => next(error));
    });

    const clients = this.redis.duplicateForAdapter();
    if (clients) {
      server.adapter(createAdapter(clients.pubClient, clients.subClient));
      this.logger.log('Socket.IO Redis adapter enabled (horizontal scaling ready)');
    } else {
      this.logger.log('Socket.IO running with the in-memory adapter (single instance)');
    }

    this.realtime.attachServer(server);
  }

  /**
   * Rejects the handshake unless the request comes from an allowed origin, is
   * within the connection budget, and carries a valid access-token cookie.
   * There is no token in the query string: it would leak through proxy logs and
   * `Referer` headers.
   */
  private async authenticateHandshake(socket: Socket): Promise<void> {
    const origin = socket.handshake.headers.origin;
    if (origin && !this.config.webOrigins.includes(origin)) {
      throw new Error('Origin not allowed');
    }

    const address = socket.handshake.address ?? 'unknown';
    const limit = await this.redis.consumeRateLimit(`ws:connect:${address}`, 20, 60_000);
    if (!limit.allowed) {
      throw new Error('Too many connection attempts');
    }

    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = cookieHeader ? parseCookie(cookieHeader) : {};
    const auth = this.tokens.verifyAccessToken(cookies[COOKIE_NAMES.accessToken]);

    if (!auth) {
      throw new Error('Authentication required');
    }

    this.states.set(socket, { userId: auth.userId, email: auth.email, subscribed: new Set() });
  }

  async handleConnection(socket: Socket): Promise<void> {
    const state = this.states.get(socket);
    if (!state) {
      // Should be unreachable: the middleware above rejects before this point.
      this.reject(socket, { code: 'UNAUTHORIZED', message: 'Authentication required' });
      return;
    }

    await socket.join(rooms.user(state.userId));
    this.logger.debug({ socketId: socket.id, userId: state.userId }, 'Realtime client connected');
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const state = this.states.get(socket);
    if (!state) return;

    for (const room of state.subscribed) {
      await this.realtime.leave(room, state.userId).catch(() => undefined);
    }
    this.states.delete(socket);
  }

  @SubscribeMessage(CLIENT_EVENTS.subscribe)
  async onSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() request: SubscribeRequest,
  ): Promise<SubscribeAck | RealtimeErrorPayload> {
    const state = this.states.get(socket);
    if (!state) return { code: 'UNAUTHORIZED', message: 'Authentication required' };

    if (!request || typeof request.id !== 'string' || request.id.length > 64) {
      return { code: 'BAD_REQUEST', message: 'Invalid subscription request' };
    }

    if (state.subscribed.size >= SUBSCRIBE_LIMIT_PER_SOCKET) {
      return { code: 'RATE_LIMITED', message: 'Too many active subscriptions' };
    }

    let room: string;
    try {
      room = await this.authorizeRoom(state.userId, request);
    } catch {
      // Access failures are reported uniformly so a client cannot distinguish
      // "does not exist" from "not yours".
      return { code: 'NOT_FOUND', message: 'Not found' };
    }

    await socket.join(room);
    state.subscribed.add(room);
    await this.realtime.heartbeat(room, state.userId);

    return { room, seq: await this.realtime.currentSequence(room) };
  }

  @SubscribeMessage(CLIENT_EVENTS.unsubscribe)
  async onUnsubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() request: SubscribeRequest,
  ): Promise<void> {
    const state = this.states.get(socket);
    if (!state || !request?.id) return;

    const room = this.roomName(request);
    if (!state.subscribed.has(room)) return;

    await socket.leave(room);
    state.subscribed.delete(room);
    await this.realtime.leave(room, state.userId);
  }

  @SubscribeMessage(CLIENT_EVENTS.heartbeat)
  async onHeartbeat(
    @ConnectedSocket() socket: Socket,
    @MessageBody() request: { room: string },
  ): Promise<void> {
    const state = this.states.get(socket);
    if (!state || !request?.room) return;
    // Only rooms this socket already proved access to can be heartbeaten.
    if (!state.subscribed.has(request.room)) return;
    await this.realtime.heartbeat(request.room, state.userId);
  }

  private roomName(request: SubscribeRequest): string {
    switch (request.scope) {
      case 'workspace':
        return rooms.workspace(request.id);
      case 'project':
        return rooms.project(request.id);
      case 'board':
        return rooms.board(request.id);
      default:
        return '';
    }
  }

  /** Re-checks entitlement in the database before the socket is allowed into a room. */
  private async authorizeRoom(userId: string, request: SubscribeRequest): Promise<string> {
    switch (request.scope) {
      case 'workspace':
        await this.access.requireWorkspace(userId, request.id);
        return rooms.workspace(request.id);
      case 'project':
        await this.access.requireProject(userId, request.id);
        return rooms.project(request.id);
      case 'board':
        await this.access.requireBoard(userId, request.id);
        return rooms.board(request.id);
      default:
        throw new Error('Unknown scope');
    }
  }

  private reject(socket: Socket, payload: RealtimeErrorPayload): void {
    socket.emit(SERVER_EVENTS.error, payload);
    socket.disconnect(true);
  }
}
