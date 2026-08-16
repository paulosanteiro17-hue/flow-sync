'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CursorPage, NotificationView } from '@flowsync/shared';
import { api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

type NotificationPage = CursorPage<NotificationView> & { unreadCount: number };

export function useNotifications(workspaceId: string, unreadOnly = false) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications(workspaceId, { unreadOnly }),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<NotificationPage>(
        `/workspaces/${workspaceId}/notifications${toQuery({
          cursor: pageParam ?? null,
          unreadOnly: unreadOnly ? 'true' : null,
          limit: 20,
        })}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
  });
}

export function useMarkNotificationsRead(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) =>
      api.post<{ unreadCount: number }>(`/workspaces/${workspaceId}/notifications/read`, { ids }),

    // Marking as read is safe to apply immediately: the worst case is a badge
    // that corrects itself on the next fetch.
    onMutate: async (ids) => {
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<{ pages: NotificationPage[]; pageParams: unknown[] }>(
        { queryKey: ['workspace', workspaceId, 'notifications'] },
        (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                ids.includes(item.id) && !item.readAt ? { ...item, readAt } : item,
              ),
              unreadCount: Math.max(0, page.unreadCount - ids.length),
            })),
          };
        },
      );
    },

    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'notifications'] }),
  });
}

export function useMarkAllNotificationsRead(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<{ unreadCount: number }>(`/workspaces/${workspaceId}/notifications/read-all`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'notifications'] }),
  });
}

/** Flattens the paginated response and exposes the unread badge count. */
export function flattenNotifications(pages: NotificationPage[] | undefined): {
  items: NotificationView[];
  unreadCount: number;
} {
  if (!pages || pages.length === 0) return { items: [], unreadCount: 0 };
  return {
    items: pages.flatMap((page) => page.items),
    unreadCount: pages[0]?.unreadCount ?? 0,
  };
}
