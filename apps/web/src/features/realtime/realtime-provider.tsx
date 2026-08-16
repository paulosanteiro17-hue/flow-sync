'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  rooms,
  type AnyRealtimeEnvelope,
  type BoardSnapshot,
  type CursorPage,
  type NotificationView,
  type PresenceUser,
  type RoomScope,
} from '@flowsync/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { realtimeClient, type ConnectionStatus } from '@/lib/realtime-client';
import {
  removeColumn,
  removeTask,
  upsertColumn,
  upsertTask,
} from '@/features/boards/board-cache';

interface RealtimeContextValue {
  status: ConnectionStatus;
  presence: Record<string, PresenceUser[]>;
  subscribe: (scope: RoomScope, id: string) => void;
  unsubscribe: (scope: RoomScope, id: string) => void;
  adoptSequence: (scope: RoomScope, id: string, seq: number) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return context;
}

/**
 * Bridges realtime events into the TanStack Query cache.
 *
 * The important decision here is that events **patch the cache** rather than
 * invalidating it. A busy board can emit dozens of events a minute; invalidating
 * on each one would turn a collaborative session into a refetch storm. Refetching
 * is reserved for the cases where a patch genuinely cannot express the change:
 * a sequence gap, a reconnect, or a server-side rebalance.
 */
export function RealtimeProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [presence, setPresence] = useState<Record<string, PresenceUser[]>>({});
  const wasDisconnected = useRef(false);

  const applyEvent = useCallback(
    (envelope: AnyRealtimeEnvelope) => {
      switch (envelope.type) {
        case 'task.created':
        case 'task.updated': {
          const { task } = envelope.payload;
          patchBoard(queryClient, workspaceId, task.boardId, (snapshot) => upsertTask(snapshot, task));
          void queryClient.invalidateQueries({
            queryKey: queryKeys.task(workspaceId, task.id),
            refetchType: 'active',
          });
          break;
        }

        case 'task.moved': {
          const { task } = envelope.payload;
          patchBoard(queryClient, workspaceId, task.boardId, (snapshot) => upsertTask(snapshot, task));
          break;
        }

        case 'task.deleted': {
          const { taskId, boardId } = envelope.payload;
          patchBoard(queryClient, workspaceId, boardId, (snapshot) => removeTask(snapshot, taskId));
          break;
        }

        case 'column.created':
        case 'column.updated':
        case 'column.moved': {
          const { column } = envelope.payload;
          patchBoard(queryClient, workspaceId, column.boardId, (snapshot) =>
            upsertColumn(snapshot, column),
          );
          break;
        }

        case 'column.deleted': {
          const { columnId, boardId, movedTasksToColumnId } = envelope.payload;
          patchBoard(queryClient, workspaceId, boardId, (snapshot) =>
            removeColumn(snapshot, columnId, movedTasksToColumnId),
          );
          break;
        }

        case 'board.updated': {
          const { board, requiresResync } = envelope.payload;
          if (requiresResync) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.board(workspaceId, board.id) });
          } else {
            patchBoard(queryClient, workspaceId, board.id, (snapshot) => ({ ...snapshot, board }));
          }
          break;
        }

        case 'board.created':
        case 'board.deleted':
        case 'project.updated': {
          void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'projects'] });
          void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'project'] });
          break;
        }

        case 'comment.created':
        case 'comment.updated':
        case 'comment.deleted': {
          const taskId =
            'comment' in envelope.payload ? envelope.payload.comment.taskId : envelope.payload.taskId;
          void queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, taskId) });
          break;
        }

        case 'attachment.created':
        case 'attachment.deleted': {
          const taskId =
            'attachment' in envelope.payload
              ? envelope.payload.attachment.taskId
              : envelope.payload.taskId;
          void queryClient.invalidateQueries({ queryKey: queryKeys.attachments(workspaceId, taskId) });
          break;
        }

        case 'member.joined':
        case 'member.updated':
        case 'member.left': {
          void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
          break;
        }

        case 'notification.created': {
          const { notification } = envelope.payload;
          prependNotification(queryClient, workspaceId, notification);
          toast(notification.title, {
            description: notification.body ?? undefined,
          });
          break;
        }

        case 'presence.updated': {
          const { room, users } = envelope.payload;
          setPresence((current) => ({ ...current, [room]: users }));
          break;
        }

        default:
          break;
      }
    },
    [queryClient, workspaceId],
  );

  useEffect(() => {
    realtimeClient.connect();

    const offEvent = realtimeClient.onEvent(applyEvent);

    const offResync = realtimeClient.onResync((room) => {
      // A gap or a reconnect: the event stream can no longer be trusted to
      // reconstruct this room, so refetch the authoritative state.
      const [scope, id] = room.split(':');
      if (scope === 'board' && id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.board(workspaceId, id) });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      }
    });

    const offStatus = realtimeClient.onStatus((next) => {
      setStatus(next);
      if (next === 'disconnected') {
        wasDisconnected.current = true;
      } else if (next === 'connected' && wasDisconnected.current) {
        wasDisconnected.current = false;
        toast.success('Reconnected', { description: 'Your board is up to date again.' });
      }
    });

    void realtimeClient.subscribe('workspace', workspaceId);

    return () => {
      offEvent();
      offResync();
      offStatus();
      realtimeClient.unsubscribe('workspace', workspaceId);
    };
  }, [applyEvent, queryClient, workspaceId]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      presence,
      subscribe: (scope, id) => void realtimeClient.subscribe(scope, id),
      unsubscribe: (scope, id) => realtimeClient.unsubscribe(scope, id),
      adoptSequence: (scope, id, seq) => realtimeClient.adoptSequence(scope, id, seq),
    }),
    [status, presence],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Subscribes to a room for the lifetime of the calling component. */
export function useRoomSubscription(scope: RoomScope, id: string | null | undefined): void {
  const { subscribe, unsubscribe } = useRealtime();

  useEffect(() => {
    if (!id) return;
    subscribe(scope, id);
    return () => unsubscribe(scope, id);
  }, [scope, id, subscribe, unsubscribe]);
}

export function usePresence(scope: RoomScope, id: string | null | undefined): PresenceUser[] {
  const { presence } = useRealtime();
  if (!id) return [];
  const room = scope === 'board' ? rooms.board(id) : scope === 'project' ? rooms.project(id) : rooms.workspace(id);
  return presence[room] ?? [];
}

type QueryClientType = ReturnType<typeof useQueryClient>;

function patchBoard(
  queryClient: QueryClientType,
  workspaceId: string,
  boardId: string,
  patch: (snapshot: BoardSnapshot) => BoardSnapshot,
): void {
  queryClient.setQueryData<BoardSnapshot>(queryKeys.board(workspaceId, boardId), (snapshot) =>
    snapshot ? patch(snapshot) : snapshot,
  );
}

function prependNotification(
  queryClient: QueryClientType,
  workspaceId: string,
  notification: NotificationView,
): void {
  queryClient.setQueriesData<CursorPage<NotificationView> & { unreadCount: number }>(
    { queryKey: ['workspace', workspaceId, 'notifications'] },
    (page) => {
      if (!page) return page;
      if (page.items.some((item) => item.id === notification.id)) return page;
      return {
        ...page,
        items: [notification, ...page.items],
        unreadCount: page.unreadCount + 1,
      };
    },
  );
}
