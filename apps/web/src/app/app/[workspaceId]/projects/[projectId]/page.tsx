'use client';

import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, can, type ProjectStatus } from '@flowsync/shared';
import { KanbanSquare, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProject, useUpdateProject } from '@/features/projects/use-projects';
import { useRoomSubscription } from '@/features/realtime/realtime-provider';
import { useWorkspace } from '@/features/workspaces/use-workspaces';
import { formatDate } from '@/lib/utils';

export default function ProjectPage() {
  const { workspaceId, projectId } = useParams<{ workspaceId: string; projectId: string }>();
  const router = useRouter();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: project, isLoading, isError, refetch } = useProject(workspaceId, projectId);
  const updateProject = useUpdateProject(workspaceId, projectId);

  useRoomSubscription('project', projectId);

  // A project with a single board is really just that board — skip the detour.
  useEffect(() => {
    if (project?.boards.length === 1 && project.boards[0]) {
      router.replace(`/app/${workspaceId}/boards/${project.boards[0].id}`);
    }
  }, [project, workspaceId, router]);

  const canEdit = can(workspace?.role, 'project:update');

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">{project?.name ?? 'Project'}</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {isError ? (
            <ErrorState
              title="This project could not be loaded"
              message="It may have been deleted, or you may not have access to it."
              onRetry={() => void refetch()}
            />
          ) : isLoading || !project ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start gap-3">
                <span
                  className="mt-1 size-4 shrink-0 rounded-[5px]"
                  style={{ backgroundColor: project.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-semibold tracking-tight">{project.name}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {project.key} · created {formatDate(project.createdAt)}
                  </p>
                  {project.description ? (
                    <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  ) : null}
                </div>

                <Select
                  value={project.status}
                  disabled={!canEdit}
                  onValueChange={(value) =>
                    updateProject.mutate({ status: value as ProjectStatus })
                  }
                >
                  <SelectTrigger className="w-40" aria-label="Project status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </header>

              <section className="rounded-xl border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <KanbanSquare className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Boards</h3>
                </header>

                {project.boards.length === 0 ? (
                  <EmptyState title="No boards yet" className="m-4 border-0" />
                ) : (
                  <ul className="divide-y divide-border">
                    {project.boards.map((board) => (
                      <li key={board.id}>
                        <Link
                          href={`/app/${workspaceId}/boards/${board.id}`}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                        >
                          <KanbanSquare className="size-4 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium">{board.name}</span>
                          {board.isDefault ? (
                            <span className="text-[11px] text-muted-foreground">Default</span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-border bg-card">
                <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <Users className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Members</h3>
                  <span className="text-xs text-muted-foreground">{project.members.length}</span>
                  {can(workspace?.role, 'project:manage_members') ? (
                    <Button asChild variant="ghost" size="sm" className="ml-auto">
                      <Link href={`/app/${workspaceId}/team`}>Manage in Team</Link>
                    </Button>
                  ) : null}
                </header>

                <ul className="divide-y divide-border">
                  {project.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                      <UserAvatar user={member.user} size="sm" decorative />
                      <span className="flex-1 text-sm">{member.user.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {member.user.id === project.lead?.id ? 'Lead' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
}
