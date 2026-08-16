'use client';

import {
  Activity,
  CheckSquare,
  LayoutDashboard,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { CreateProjectDialog } from '@/features/projects/create-project-dialog';
import { useProjects } from '@/features/projects/use-projects';
import { useWorkspace } from '@/features/workspaces/use-workspaces';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { can } from '@flowsync/shared';
import { WorkspaceSwitcher } from './workspace-switcher';

export function Sidebar({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: projects, isLoading } = useProjects(workspaceId);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const [createOpen, setCreateOpen] = useState(false);

  const links = [
    { href: `/app/${workspaceId}`, label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: `/app/${workspaceId}/my-tasks`, label: 'My Tasks', icon: CheckSquare },
    { href: `/app/${workspaceId}/activity`, label: 'Activity', icon: Activity },
    { href: `/app/${workspaceId}/team`, label: 'Team', icon: Users },
    { href: `/app/${workspaceId}/settings`, label: 'Settings', icon: Settings },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Backdrop for the mobile drawer. */}
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href={`/app/${workspaceId}`} className="min-w-0" aria-label="FlowSync home">
            <Wordmark />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          >
            <X />
          </Button>
        </div>

        <div className="px-3 pb-3">
          <WorkspaceSwitcher workspaceId={workspaceId} />
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-4" aria-label="Main">
          <ul className="space-y-0.5">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileNavOpen(false)}
                  aria-current={isActive(link.href, link.exact) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive(link.href, link.exact)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <link.icon className="size-4" />
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Projects
              </h2>
              {can(workspace?.role, 'project:create') ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Create project"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus />
                </Button>
              ) : null}
            </div>

            {isLoading ? (
              <div className="space-y-1.5 px-2.5 py-1">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-4/5" />
                <Skeleton className="h-6 w-3/5" />
              </div>
            ) : projects && projects.length > 0 ? (
              <ul className="space-y-0.5">
                {projects.map((project) => {
                  const href = `/app/${workspaceId}/projects/${project.id}`;
                  return (
                    <li key={project.id}>
                      <Link
                        href={href}
                        onClick={() => setMobileNavOpen(false)}
                        aria-current={pathname.startsWith(href) ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                          pathname.startsWith(href)
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        )}
                      >
                        <span
                          className="size-2 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: project.color }}
                          aria-hidden
                        />
                        <span className="truncate">{project.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70">
                          {project.key}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">
                No projects yet.
              </p>
            )}
          </div>
        </nav>
      </aside>

      <CreateProjectDialog workspaceId={workspaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
