'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS } from '@flowsync/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';

export function WorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { data: workspaces } = useWorkspaces();
  const current = workspaces?.find((workspace) => workspace.id === workspaceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto w-full justify-start gap-2 bg-card px-2.5 py-2 text-left"
          aria-label={`Switch workspace, currently ${current?.name ?? 'none selected'}`}
        >
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground"
            aria-hidden
          >
            {(current?.name ?? 'W').charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {current?.name ?? 'Workspace'}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {current ? ROLE_LABELS[current.role] : ''}
              {current?.isDemo ? ' · Demo' : ''}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces?.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onSelect={() => router.push(`/app/${workspace.id}`)}>
            <span className="truncate">{workspace.name}</span>
            {workspace.id === workspaceId ? <Check className="ml-auto" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
          <Plus />
          New workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
