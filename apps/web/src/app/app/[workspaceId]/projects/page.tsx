'use client';

import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, can, type ProjectStatus } from '@flowsync/shared';
import { FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { CreateProjectDialog } from '@/features/projects/create-project-dialog';
import { useProjects } from '@/features/projects/use-projects';
import { useWorkspace } from '@/features/workspaces/use-workspaces';
import { cn, relativeTime } from '@/lib/utils';

const STATUS_TONE: Record<
  ProjectStatus,
  'default' | 'secondary' | 'success' | 'warning' | 'outline'
> = {
  PLANNING: 'secondary',
  ACTIVE: 'default',
  ON_HOLD: 'warning',
  COMPLETED: 'success',
  ARCHIVED: 'outline',
};

function ProjectsPageInner() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();
  const { data: workspace } = useWorkspace(workspaceId);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | 'ALL'>('ALL');
  // `?new=1` is only meaningful on arrival (onboarding links here), so it seeds
  // the initial state rather than being synchronised on every render.
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');

  const {
    data: projects,
    isLoading,
    isError,
    refetch,
  } = useProjects(workspaceId, {
    ...(status === 'ALL' ? {} : { status }),
    includeArchived: status === 'ARCHIVED',
  });

  const visible = (projects ?? []).filter((project) =>
    search.trim()
      ? `${project.name} ${project.key}`.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">Projects</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects…"
              className="h-9 w-full sm:max-w-xs"
              aria-label="Search projects"
            />

            <div className="flex flex-wrap gap-1">
              {(['ALL', ...PROJECT_STATUSES] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  aria-pressed={status === option}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    status === option
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {option === 'ALL' ? 'All' : PROJECT_STATUS_LABELS[option]}
                </button>
              ))}
            </div>

            {can(workspace?.role, 'project:create') ? (
              <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
                <Plus />
                New project
              </Button>
            ) : null}
          </div>

          {isError ? (
            <ErrorState message="Projects could not be loaded." onRetry={() => void refetch()} />
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-40" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<FolderKanban />}
              title={search ? 'No projects match your search' : 'No projects yet'}
              description={
                search
                  ? 'Try a different name or key.'
                  : 'Projects group boards, tasks and the people working on them.'
              }
              action={
                can(workspace?.role, 'project:create') && !search ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus />
                    Create your first project
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((project) => {
                const progress =
                  project.taskCount === 0
                    ? 0
                    : Math.round((project.completedTaskCount / project.taskCount) * 100);

                return (
                  <Link
                    key={project.id}
                    href={`/app/${workspaceId}/projects/${project.id}`}
                    className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 size-3 shrink-0 rounded-[4px]"
                        style={{ backgroundColor: project.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                        <p className="font-mono text-[11px] text-muted-foreground">{project.key}</p>
                      </div>
                      <Badge variant={STATUS_TONE[project.status]}>
                        {PROJECT_STATUS_LABELS[project.status]}
                      </Badge>
                    </div>

                    {project.description ? (
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                        {project.description}
                      </p>
                    ) : null}

                    <div className="mt-auto pt-4">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>
                          {project.completedTaskCount}/{project.taskCount} tasks
                        </span>
                        <span className="tabular-nums">{progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        {project.lead ? (
                          <>
                            <UserAvatar user={project.lead} size="xs" decorative />
                            <span className="truncate text-[11px] text-muted-foreground">
                              {project.lead.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No lead</span>
                        )}
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {relativeTime(project.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <CreateProjectDialog
        workspaceId={workspaceId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageInner />
    </Suspense>
  );
}
