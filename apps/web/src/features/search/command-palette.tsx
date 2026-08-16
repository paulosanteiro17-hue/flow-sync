'use client';

import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  Activity,
  Bell,
  CheckSquare,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SearchResults } from '@flowsync/shared';
import { api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { useUiStore } from '@/stores/ui-store';

/**
 * Ctrl/Cmd + K palette: search across the workspace and jump anywhere.
 *
 * The query is debounced and only fires past two characters, so typing does not
 * generate a request per keystroke.
 */
export function CommandPalette({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const toggle = useUiStore((state) => state.toggleCommandPalette);

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 180);
    return () => clearTimeout(timer);
  }, [term]);

  // Closing resets the query. Doing it in the close handler rather than in an
  // effect keeps the reset an explicit consequence of the user's action.
  const setPaletteOpen = (next: boolean) => {
    if (!next) {
      setTerm('');
      setDebounced('');
    }
    setOpen(next);
  };

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(workspaceId, debounced),
    queryFn: () =>
      api.get<SearchResults>(
        `/workspaces/${workspaceId}/search${toQuery({ q: debounced, limit: 5 })}`,
      ),
    enabled: open && debounced.length >= 2,
    staleTime: 15_000,
  });

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  const navigation = [
    { label: 'Dashboard', icon: LayoutDashboard, href: `/app/${workspaceId}` },
    { label: 'My Tasks', icon: CheckSquare, href: `/app/${workspaceId}/my-tasks` },
    { label: 'Activity', icon: Activity, href: `/app/${workspaceId}/activity` },
    { label: 'Team', icon: Users, href: `/app/${workspaceId}/team` },
    { label: 'Notifications', icon: Bell, href: `/app/${workspaceId}/notifications` },
    { label: 'Settings', icon: Settings, href: `/app/${workspaceId}/settings` },
  ];

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-w-xl overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Search and navigate</DialogTitle>

        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={term}
              onValueChange={setTerm}
              placeholder="Search tasks, projects and people…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>

          <Command.List className="max-h-[24rem] scrollbar-thin overflow-y-auto p-1.5">
            {debounced.length >= 2 && !isFetching && !hasResults(data) ? (
              <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
                No matches for “{debounced}”.
              </Command.Empty>
            ) : null}

            {data?.tasks?.length ? (
              <Command.Group heading="Tasks">
                {data.tasks.map((task) => (
                  <Command.Item
                    key={task.id}
                    value={task.id}
                    onSelect={() =>
                      go(`/app/${workspaceId}/boards/${task.boardId}?task=${task.id}`)
                    }
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">{task.key}</span>
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.assignees[0] ? (
                      <UserAvatar user={task.assignees[0]} size="xs" decorative />
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {data?.projects?.length ? (
              <Command.Group heading="Projects">
                {data.projects.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={project.id}
                    onSelect={() => go(`/app/${workspaceId}/projects/${project.id}`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <span
                      className="size-2 rounded-[3px]"
                      style={{ backgroundColor: project.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {project.key}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {data?.members?.length ? (
              <Command.Group heading="People">
                {data.members.map((member) => (
                  <Command.Item
                    key={member.id}
                    value={member.id}
                    onSelect={() => go(`/app/${workspaceId}/team`)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <UserAvatar user={member} size="xs" decorative />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{member.email}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {debounced.length < 2 ? (
              <Command.Group heading="Go to">
                {navigation.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent"
                  >
                    <item.icon className="size-4 text-muted-foreground" />
                    {item.label}
                  </Command.Item>
                ))}
                <Command.Item
                  value="new-project"
                  onSelect={() => go(`/app/${workspaceId}/projects?new=1`)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-accent"
                >
                  <Plus className="size-4 text-muted-foreground" />
                  Create project
                </Command.Item>
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function hasResults(data: SearchResults | undefined): boolean {
  if (!data) return false;
  return (
    data.tasks.length > 0 ||
    data.projects.length > 0 ||
    data.members.length > 0 ||
    data.comments.length > 0
  );
}
