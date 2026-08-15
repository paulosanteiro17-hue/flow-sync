import type {
  AttachmentView,
  BoardColumnView,
  BoardSummary,
  CommentView,
  NotificationView,
  PresenceUser,
  ProjectSummary,
  TaskSummary,
  UserSummary,
} from './types';
import type { WorkspaceRole } from './constants';

/** Every event the server is allowed to emit. Adding one here forces both sides to handle it. */
export const REALTIME_EVENT_TYPES = [
  'task.created',
  'task.updated',
  'task.moved',
  'task.deleted',
  'column.created',
  'column.updated',
  'column.moved',
  'column.deleted',
  'board.created',
  'board.updated',
  'board.deleted',
  'project.updated',
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'attachment.created',
  'attachment.deleted',
  'member.joined',
  'member.updated',
  'member.left',
  'notification.created',
  'presence.updated',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeEventPayloads {
  'task.created': { task: TaskSummary };
  'task.updated': { task: TaskSummary };
  'task.moved': {
    task: TaskSummary;
    fromColumnId: string;
    toColumnId: string;
  };
  'task.deleted': { taskId: string; columnId: string; boardId: string };
  'column.created': { column: BoardColumnView };
  'column.updated': { column: BoardColumnView };
  'column.moved': { column: BoardColumnView };
  'column.deleted': { columnId: string; boardId: string; movedTasksToColumnId: string | null };
  'board.created': { board: BoardSummary };
  /** Emitted after a server-side rebalance or any change the client cannot patch incrementally. */
  'board.updated': { board: BoardSummary; requiresResync: boolean };
  'board.deleted': { boardId: string; projectId: string };
  'project.updated': { project: ProjectSummary };
  'comment.created': { comment: CommentView };
  'comment.updated': { comment: CommentView };
  'comment.deleted': { commentId: string; taskId: string };
  'attachment.created': { attachment: AttachmentView };
  'attachment.deleted': { attachmentId: string; taskId: string };
  'member.joined': { member: UserSummary; role: WorkspaceRole; workspaceId: string };
  'member.updated': { memberId: string; userId: string; role: WorkspaceRole; workspaceId: string };
  'member.left': { userId: string; workspaceId: string };
  'notification.created': { notification: NotificationView; unreadCount: number };
  'presence.updated': { room: string; users: PresenceUser[] };
}

export interface RealtimeEnvelope<T extends RealtimeEventType = RealtimeEventType> {
  /** Unique per emission — the client de-duplicates on this. */
  id: string;
  type: T;
  /** The room the event was broadcast to, e.g. `board:clx123`. */
  room: string;
  /** Monotonically increasing per room. A gap means the client must resynchronise. */
  seq: number;
  ts: string;
  actorId: string | null;
  payload: RealtimeEventPayloads[T];
}

export type AnyRealtimeEnvelope = {
  [K in RealtimeEventType]: RealtimeEnvelope<K>;
}[RealtimeEventType];

/** Room name builders. The server derives rooms from the database, never from client input. */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  workspace: (workspaceId: string) => `workspace:${workspaceId}`,
  project: (projectId: string) => `project:${projectId}`,
  board: (boardId: string) => `board:${boardId}`,
} as const;

export type RoomScope = 'workspace' | 'project' | 'board';

export interface SubscribeRequest {
  scope: RoomScope;
  id: string;
}

export interface SubscribeAck {
  room: string;
  /** The server's current sequence for this room; the client starts expecting `seq + 1`. */
  seq: number;
}

export interface RealtimeErrorPayload {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'RATE_LIMITED' | 'BAD_REQUEST';
  message: string;
}

/** Client → server message names. */
export const CLIENT_EVENTS = {
  subscribe: 'subscribe',
  unsubscribe: 'unsubscribe',
  heartbeat: 'presence:heartbeat',
} as const;

/** Server → client message names. */
export const SERVER_EVENTS = {
  event: 'event',
  subscribed: 'subscribed',
  unsubscribed: 'unsubscribed',
  error: 'realtime:error',
} as const;

export interface ClientToServerEvents {
  [CLIENT_EVENTS.subscribe]: (
    request: SubscribeRequest,
    ack: (response: SubscribeAck | RealtimeErrorPayload) => void,
  ) => void;
  [CLIENT_EVENTS.unsubscribe]: (request: SubscribeRequest) => void;
  [CLIENT_EVENTS.heartbeat]: (request: { room: string }) => void;
}

export interface ServerToClientEvents {
  [SERVER_EVENTS.event]: (envelope: AnyRealtimeEnvelope) => void;
  [SERVER_EVENTS.error]: (payload: RealtimeErrorPayload) => void;
}

/** Presence heartbeats are sent on this cadence; entries expire after `PRESENCE_TTL_MS`. */
export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_TTL_MS = 45_000;
/** Presence broadcasts are coalesced to at most one per room per window. */
export const PRESENCE_BROADCAST_THROTTLE_MS = 1_000;
/** How many recent event ids the client remembers per room for de-duplication. */
export const DEDUPE_WINDOW = 500;
