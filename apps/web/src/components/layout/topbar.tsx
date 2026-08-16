'use client';

import { LogOut, Menu, Search, Settings, User, WifiOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { UserAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/misc';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCurrentUser, useSignOut } from '@/features/auth/use-auth';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { useRealtime } from '@/features/realtime/realtime-provider';
import { useUiStore } from '@/stores/ui-store';

export function Topbar({ workspaceId, children }: { workspaceId: string; children?: ReactNode }) {
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Open navigation"
        onClick={() => setMobileNavOpen(true)}
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">{children}</div>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent sm:flex"
      >
        <Search className="size-3.5" />
        <span>Search…</span>
        <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">Ctrl K</kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Search"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search />
      </Button>

      <ConnectionIndicator />
      <NotificationBell workspaceId={workspaceId} />
      <ThemeToggle />
      <UserMenu workspaceId={workspaceId} />
    </header>
  );
}

/**
 * Only visible when something is wrong. A permanent "connected" badge is noise;
 * a clear "you are offline" state is the thing a user actually needs.
 */
function ConnectionIndicator() {
  const { status } = useRealtime();
  if (status === 'connected') return null;

  const label =
    status === 'unauthorized'
      ? 'Session expired — reload to reconnect'
      : status === 'connecting'
        ? 'Connecting to live updates…'
        : 'Offline — changes may be out of date';

  return (
    <Tooltip content={label}>
      <span
        role="status"
        className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400"
      >
        <WifiOff className="size-3" />
        <span className="hidden sm:inline">
          {status === 'connecting' ? 'Connecting' : 'Offline'}
        </span>
      </span>
    </Tooltip>
  );
}

function UserMenu({ workspaceId }: { workspaceId: string }) {
  const { data: user } = useCurrentUser();
  const signOut = useSignOut();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <UserAvatar user={user} size="md" decorative />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={`/app/${workspaceId}/settings`}>
            <User />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/app/${workspaceId}/settings?tab=workspace`}>
            <Settings />
            Workspace settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => signOut.mutate()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
