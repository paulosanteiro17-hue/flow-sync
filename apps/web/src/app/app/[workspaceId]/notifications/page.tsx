'use client';

import type { NotificationType, NotificationView } from '@flowsync/shared';
import { AtSign, Bell, CalendarClock, CheckCheck, MessageSquare, UserPlus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
} from '@/features/notifications/use-notifications';
import { cn, relativeTime } from '@/lib/utils';

const ICONS: Record<NotificationType, typeof Bell> = {
  TASK_ASSIGNED: UserPlus,
  MENTION: AtSign,
  COMMENT: MessageSquare,
  DUE_SOON: CalendarClock,
  STATUS_CHANGE: CheckCheck,
  INVITATION: UserPlus,
};

/**
 * The full notification centre. The bell in the top bar is the quick view; this is
 * where someone catches up after a few days away, with paging and a filter.
 */
export default function NotificationsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useNotifications(workspaceId, unreadOnly);
  const markRead = useMarkNotificationsRead(workspaceId);
  const markAllRead = useMarkAllNotificationsRead(workspaceId);

  const { items, unreadCount } = flattenNotifications(data?.pages);

  const open = (notification: NotificationView) => {
    if (!notification.readAt) markRead.mutate([notification.id]);
    if (notification.link) router.push(notification.link);
  };

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Notifications</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {[
                { value: false, label: 'All' },
                { value: true, label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setUnreadOnly(option.value)}
                  aria-pressed={unreadOnly === option.value}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    unreadOnly === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {unreadCount > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                loading={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                <CheckCheck />
                Mark all read
              </Button>
            ) : null}
          </div>

          {isError ? (
            <ErrorState
              message="Notifications could not be loaded."
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
              description="Assignments, mentions, comments and status changes show up here."
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {items.map((notification) => {
                const Icon = ICONS[notification.type];
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => open(notification)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                        !notification.readAt && 'bg-primary/[0.04]',
                      )}
                    >
                      {notification.actor ? (
                        <UserAvatar user={notification.actor} size="md" decorative />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                          <Icon className="size-4 text-muted-foreground" />
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="flex-1 text-sm font-medium">{notification.title}</span>
                          {notification.taskKey ? (
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                              {notification.taskKey}
                            </span>
                          ) : null}
                          {!notification.readAt ? (
                            <span
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          ) : null}
                        </span>

                        {notification.body ? (
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            {notification.body}
                          </span>
                        ) : null}

                        <span className="mt-1 block text-[11px] text-muted-foreground/80">
                          {relativeTime(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {hasNextPage ? (
            <Button
              variant="outline"
              className="w-full"
              loading={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              Load more
            </Button>
          ) : null}
        </div>
      </main>
    </>
  );
}
