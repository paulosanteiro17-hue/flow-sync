'use client';

import { AtSign, Bell, CalendarClock, CheckCheck, MessageSquare, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { NotificationType, NotificationView } from '@flowsync/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, EmptyState } from '@/components/ui/misc';
import { UserAvatar } from '@/components/ui/avatar';
import { cn, relativeTime } from '@/lib/utils';
import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
} from './use-notifications';

const ICONS: Record<NotificationType, typeof Bell> = {
  TASK_ASSIGNED: UserPlus,
  MENTION: AtSign,
  COMMENT: MessageSquare,
  DUE_SOON: CalendarClock,
  STATUS_CHANGE: CheckCheck,
  INVITATION: UserPlus,
};

export function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(workspaceId);
  const markRead = useMarkNotificationsRead(workspaceId);
  const markAllRead = useMarkAllNotificationsRead(workspaceId);

  const { items, unreadCount } = flattenNotifications(data?.pages);

  const openNotification = (notification: NotificationView) => {
    if (!notification.readAt) markRead.mutate([notification.id]);
    setOpen(false);
    if (notification.link) router.push(notification.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Bell />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-bold text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              Mark all read
            </Button>
          ) : null}
        </div>

        <div className="border-b border-border px-3 py-1.5">
          <Link
            href={`/app/${workspaceId}/notifications`}
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Open the notification centre
          </Link>
        </div>

        <div className="max-h-[26rem] scrollbar-thin overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title="You are all caught up"
              description="Assignments, mentions and comments will show up here."
              className="m-3 border-0 py-8"
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((notification) => {
                const Icon = ICONS[notification.type];
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={cn(
                        'flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                        !notification.readAt && 'bg-primary/[0.04]',
                      )}
                    >
                      {notification.actor ? (
                        <UserAvatar user={notification.actor} size="sm" decorative />
                      ) : (
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted">
                          <Icon className="size-3.5 text-muted-foreground" />
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className="flex-1 text-sm leading-snug font-medium">
                            {notification.title}
                          </span>
                          {!notification.readAt ? (
                            <span
                              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                              aria-label="Unread"
                            />
                          ) : null}
                        </span>
                        {notification.body ? (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
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
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                loading={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
