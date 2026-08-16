'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityView, CursorPage } from '@flowsync/shared';
import { Activity } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, relativeTime } from '@/lib/utils';

export default function ActivityPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } =
    useInfiniteQuery({
      queryKey: queryKeys.activity(workspaceId),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        api.get<CursorPage<ActivityView>>(
          `/workspaces/${workspaceId}/activity${toQuery({ cursor: pageParam ?? null, limit: 30 })}`,
        ),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: Boolean(workspaceId),
    });

  const events = data?.pages.flatMap((page) => page.items) ?? [];

  // Group by calendar day so a long feed stays scannable.
  const groups = events.reduce<Record<string, ActivityView[]>>((accumulator, event) => {
    const day = formatDate(event.createdAt, 'EEEE, d MMMM yyyy');
    (accumulator[day] ??= []).push(event);
    return accumulator;
  }, {});

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Activity</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {isError ? (
            <ErrorState
              message="The activity feed could not be loaded."
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-12" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="No activity yet"
              description="Every meaningful change in this workspace shows up here."
            />
          ) : (
            <>
              {Object.entries(groups).map(([day, dayEvents]) => (
                <section key={day}>
                  <h2 className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                    {day}
                  </h2>
                  <ul className="space-y-1">
                    {dayEvents.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
                      >
                        <UserAvatar user={event.actor} size="sm" decorative />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">{event.message}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {relativeTime(event.createdAt)}
                          </p>
                        </div>
                        {event.taskKey ? (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {event.taskKey}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {hasNextPage ? (
                <Button
                  variant="outline"
                  className="w-full"
                  loading={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                >
                  Load more
                </Button>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  That is the whole history.
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
