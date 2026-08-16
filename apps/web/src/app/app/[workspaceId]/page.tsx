'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardSummary, TaskSummary } from '@flowsync/shared';
import { AlertTriangle, CalendarClock, CheckCircle2, Inbox, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, describeDueDate, relativeTime } from '@/lib/utils';
import { useCurrentUser } from '@/features/auth/use-auth';
import { CreateProjectDialog } from '@/features/projects/create-project-dialog';
import { useWorkspace } from '@/features/workspaces/use-workspaces';
import { can } from '@flowsync/shared';

export default function DashboardPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: user } = useCurrentUser();
  const { data: workspace } = useWorkspace(workspaceId);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.dashboard(workspaceId),
    queryFn: () => api.get<DashboardSummary>(`/workspaces/${workspaceId}/dashboard`),
    enabled: Boolean(workspaceId),
  });

  const firstName = user?.name.split(' ')[0] ?? 'there';

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Dashboard</h1>
      </Topbar>

      <main className="flex-1 overflow-y-auto scrollbar-thin p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Good to see you, {firstName}</h2>
              <p className="text-sm text-muted-foreground">
                Here is what needs you in {workspace?.name ?? 'this workspace'}.
              </p>
            </div>
            {can(workspace?.role, 'project:create') ? (
              <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
                <Plus />
                New project
              </Button>
            ) : null}
          </div>

          {isError ? (
            <ErrorState message="The dashboard could not be loaded." onRetry={() => void refetch()} />
          ) : isLoading || !data ? (
            <DashboardSkeleton />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Assigned to me"
                  value={data.stats.assignedOpen}
                  icon={Inbox}
                  href={`/app/${workspaceId}/my-tasks`}
                />
                <StatCard
                  label="Due soon"
                  value={data.stats.dueSoon}
                  icon={CalendarClock}
                  href={`/app/${workspaceId}/my-tasks?bucket=upcoming`}
                  tone={data.stats.dueSoon > 0 ? 'warning' : 'default'}
                />
                <StatCard
                  label="Overdue"
                  value={data.stats.overdue}
                  icon={AlertTriangle}
                  href={`/app/${workspaceId}/my-tasks?bucket=overdue`}
                  tone={data.stats.overdue > 0 ? 'danger' : 'default'}
                />
                <StatCard
                  label="Completed this week"
                  value={data.stats.completedThisWeek}
                  icon={CheckCircle2}
                  href={`/app/${workspaceId}/my-tasks?bucket=completed`}
                  tone="success"
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <Panel
                    title="Assigned to me"
                    action={
                      <Link
                        href={`/app/${workspaceId}/my-tasks`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View all
                      </Link>
                    }
                  >
                    {data.assignedToMe.length === 0 ? (
                      <EmptyState
                        icon={<Inbox />}
                        title="Nothing assigned to you"
                        description="Tasks assigned to you will show up here."
                        className="border-0"
                      />
                    ) : (
                      <TaskList workspaceId={workspaceId} tasks={data.assignedToMe} />
                    )}
                  </Panel>

                  {data.overdue.length > 0 ? (
                    <Panel title="Overdue">
                      <TaskList workspaceId={workspaceId} tasks={data.overdue} />
                    </Panel>
                  ) : null}

                  <Panel title="Recent projects">
                    {data.recentProjects.length === 0 ? (
                      <EmptyState
                        title="No projects yet"
                        description="Create a project to start planning work."
                        className="border-0"
                        action={
                          can(workspace?.role, 'project:create') ? (
                            <Button size="sm" onClick={() => setCreateOpen(true)}>
                              <Plus />
                              New project
                            </Button>
                          ) : undefined
                        }
                      />
                    ) : (
                      <ul className="divide-y divide-border">
                        {data.recentProjects.map((project) => {
                          const progress =
                            project.taskCount === 0
                              ? 0
                              : Math.round((project.completedTaskCount / project.taskCount) * 100);
                          return (
                            <li key={project.id}>
                              <Link
                                href={`/app/${workspaceId}/projects/${project.id}`}
                                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                              >
                                <span
                                  className="size-2.5 shrink-0 rounded-[4px]"
                                  style={{ backgroundColor: project.color }}
                                  aria-hidden
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {project.name}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {project.completedTaskCount} of {project.taskCount} tasks done
                                  </span>
                                </span>
                                <span className="hidden w-24 sm:block">
                                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                                    <span
                                      className="block h-full rounded-full bg-primary"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </span>
                                </span>
                                <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                                  {progress}%
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Panel>
                </div>

                <div className="space-y-6">
                  <Panel
                    title="Recent activity"
                    action={
                      <Link
                        href={`/app/${workspaceId}/activity`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        View all
                      </Link>
                    }
                  >
                    {data.recentActivity.length === 0 ? (
                      <EmptyState title="No activity yet" className="border-0" />
                    ) : (
                      <ul className="space-y-3 px-4 py-3">
                        {data.recentActivity.map((event) => (
                          <li key={event.id} className="flex gap-2.5">
                            <UserAvatar user={event.actor} size="sm" decorative />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug">{event.message}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {relativeTime(event.createdAt)}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>

                  {data.dueSoon.length > 0 ? (
                    <Panel title="Upcoming deadlines">
                      <TaskList workspaceId={workspaceId} tasks={data.dueSoon} />
                    </Panel>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <CreateProjectDialog workspaceId={workspaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  href: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const tones = {
    default: 'text-muted-foreground',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-destructive',
    success: 'text-emerald-600 dark:text-emerald-400',
  } as const;

  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('size-4', tones[tone])} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

function TaskList({ workspaceId, tasks }: { workspaceId: string; tasks: TaskSummary[] }) {
  return (
    <ul className="divide-y divide-border">
      {tasks.map((task) => {
        const due = describeDueDate(task.dueDate);
        return (
          <li key={task.id}>
            <Link
              href={`/app/${workspaceId}/boards/${task.boardId}?task=${task.id}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
            >
              <span className="font-mono text-[11px] text-muted-foreground">{task.key}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
              {due ? (
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    due.tone === 'overdue'
                      ? 'font-medium text-destructive'
                      : due.tone === 'today'
                        ? 'font-medium text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground',
                  )}
                >
                  {due.label}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-[86px]" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
