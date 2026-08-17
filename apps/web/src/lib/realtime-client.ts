import {
  CLIENT_EVENTS,
  DEDUPE_WINDOW,
  PRESENCE_HEARTBEAT_MS,
  SERVER_EVENTS,
  type AnyRealtimeEnvelope,
  type RoomScope,
  type SubscribeAck,
} from '@flowsync/shared';
import { io, type Socket } from 'socket.io-client';
import { API_URL, setSocketId } from './api-client';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

export type EventHandler = (envelope: AnyRealtimeEnvelope) => void;
/** Called when the client cannot patch its way to a correct state and must refetch. */
export type ResyncHandler = (room: string) => void;

interface RoomState {
  scope: RoomScope;
  id: string;
  /** Reference count: several components can subscribe to the same board. */
  subscribers: number;
  lastSeq: number;
  /** Ring buffer of recently applied event ids. */
  seen: Set<string>;
  seenOrder: string[];
}

/**
 * Realtime client.
 *
 * Three problems this solves that a naive `socket.on('event')` does not:
 *
 *  1. **Ordering.** Every envelope carries a per-room sequence. An event that is
 *     not the next expected one means something was missed, so instead of applying
 *     it out of order the client asks the caller to refetch.
 *  2. **Duplicates.** Reconnects and multiple tabs can redeliver an event. Each
 *     envelope has a unique id and the last few hundred are remembered per room.
 *  3. **Reconnection.** Socket.IO restores the transport, but the server-side room
 *     membership and any events missed while offline are ours to recover: rooms are
 *     re-subscribed and every one of them is marked for resync.
 */
export class RealtimeClient {
  private socket: Socket | null = null;
  private readonly rooms = new Map<string, RoomState>();
  private readonly eventHandlers = new Set<EventHandler>();
  private readonly resyncHandlers = new Set<ResyncHandler>();
  private readonly statusHandlers = new Set<(status: ConnectionStatus) => void>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private status: ConnectionStatus = 'disconnected';

  connect(): void {
    if (this.socket) return;

    this.setStatus('connecting');
    this.socket = io(API_URL, {
      path: '/realtime',
      // The handshake carries the httpOnly auth cookie; nothing is read from JS.
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8_000,
      timeout: 10_000,
    });

    this.socket.on('connect', () => {
      setSocketId(this.socket?.id ?? null);
      this.setStatus('connected');
      void this.resubscribeAll();
    });

    this.socket.on('disconnect', () => {
      setSocketId(null);
      this.setStatus('disconnected');
    });

    this.socket.on('connect_error', (error: Error) => {
      // The server closes the handshake with a message rather than a status code.
      const unauthorized = /auth|unauthor/i.test(error.message);
      this.setStatus(unauthorized ? 'unauthorized' : 'disconnected');
    });

    this.socket.on(SERVER_EVENTS.event, (envelope: AnyRealtimeEnvelope) => {
      this.handleEnvelope(envelope);
    });

    this.startHeartbeat();
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
    this.rooms.clear();
    setSocketId(null);
    this.setStatus('disconnected');
  }

  get socketId(): string | null {
    return this.socket?.id ?? null;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  // ---------------------------------------------------------------------------
  // Subscriptions
  // ---------------------------------------------------------------------------

  async subscribe(scope: RoomScope, id: string): Promise<void> {
    const room = `${scope}:${id}`;
    const existing = this.rooms.get(room);

    if (existing) {
      existing.subscribers += 1;
      return;
    }

    this.rooms.set(room, {
      scope,
      id,
      subscribers: 1,
      lastSeq: 0,
      seen: new Set(),
      seenOrder: [],
    });

    await this.sendSubscribe(scope, id);
  }

  unsubscribe(scope: RoomScope, id: string): void {
    const room = `${scope}:${id}`;
    const state = this.rooms.get(room);
    if (!state) return;

    state.subscribers -= 1;
    if (state.subscribers > 0) return;

    this.rooms.delete(room);
    this.socket?.emit(CLIENT_EVENTS.unsubscribe, { scope, id });
  }

  /** Adopts the sequence a REST snapshot was taken at, so the next event lines up. */
  adoptSequence(scope: RoomScope, id: string, seq: number): void {
    const state = this.rooms.get(`${scope}:${id}`);
    // A subscribe acknowledgement or an event may have advanced the stream while
    // the snapshot request was in flight. Never let a late snapshot rewind it.
    if (state) state.lastSeq = Math.max(state.lastSeq, seq);
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onResync(handler: ResyncHandler): () => void {
    this.resyncHandlers.add(handler);
    return () => this.resyncHandlers.delete(handler);
  }

  onStatus(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    handler(this.status);
    return () => this.statusHandlers.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async sendSubscribe(scope: RoomScope, id: string): Promise<void> {
    if (!this.socket?.connected) return;

    const ack = await new Promise<SubscribeAck | { code: string } | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 8_000);
      this.socket?.emit(CLIENT_EVENTS.subscribe, { scope, id }, (response: SubscribeAck) => {
        clearTimeout(timer);
        resolve(response);
      });
    });

    if (ack && 'seq' in ack) {
      const room = `${scope}:${id}`;
      const state = this.rooms.get(room);
      if (!state) return;

      // The snapshot and the room subscription start independently. If the
      // server is already ahead when the acknowledgement arrives, an event may
      // have landed after the snapshot but before this socket joined the room.
      // Refetching closes that window; taking the maximum also prevents a late
      // acknowledgement from rewinding events already received by the client.
      const mayHaveMissedEvents = ack.seq > state.lastSeq;
      state.lastSeq = Math.max(state.lastSeq, ack.seq);
      if (mayHaveMissedEvents) this.emitResync(room);
    }
  }

  private async resubscribeAll(): Promise<void> {
    for (const [room, state] of this.rooms) {
      await this.sendSubscribe(state.scope, state.id);
      // Anything that happened while the socket was down is unrecoverable from
      // the event stream alone, so the caller refetches the authoritative state.
      this.emitResync(room);
    }
  }

  private handleEnvelope(envelope: AnyRealtimeEnvelope): void {
    const state = this.rooms.get(envelope.room);

    // Personal rooms (`user:{id}`) are joined server-side and are not sequenced
    // against a snapshot, so they bypass gap detection.
    if (!state) {
      this.dispatch(envelope);
      return;
    }

    if (state.seen.has(envelope.id)) return;

    if (envelope.seq > state.lastSeq + 1 && state.lastSeq > 0) {
      // A gap means at least one event never arrived. Applying this one would
      // leave the board subtly wrong, so refetch instead.
      state.lastSeq = envelope.seq;
      this.remember(state, envelope.id);
      this.emitResync(envelope.room);
      return;
    }

    if (envelope.seq <= state.lastSeq) {
      // Already accounted for — a redelivery or an event older than our snapshot.
      this.remember(state, envelope.id);
      return;
    }

    state.lastSeq = envelope.seq;
    this.remember(state, envelope.id);
    this.dispatch(envelope);
  }

  private remember(state: RoomState, eventId: string): void {
    state.seen.add(eventId);
    state.seenOrder.push(eventId);
    while (state.seenOrder.length > DEDUPE_WINDOW) {
      const oldest = state.seenOrder.shift();
      if (oldest) state.seen.delete(oldest);
    }
  }

  private dispatch(envelope: AnyRealtimeEnvelope): void {
    for (const handler of this.eventHandlers) handler(envelope);
  }

  private emitResync(room: string): void {
    for (const handler of this.resyncHandlers) handler(room);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected) return;
      for (const room of this.rooms.keys()) {
        this.socket.emit(CLIENT_EVENTS.heartbeat, { room });
      }
    }, PRESENCE_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}

export const realtimeClient = new RealtimeClient();
