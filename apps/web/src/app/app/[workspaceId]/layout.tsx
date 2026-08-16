'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/misc';
import { Sidebar } from '@/components/layout/sidebar';
import { RealtimeProvider } from '@/features/realtime/realtime-provider';
import { CommandPalette } from '@/features/search/command-palette';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  return (
    <TooltipProvider delayDuration={300}>
      <RealtimeProvider workspaceId={workspaceId}>
        <div className="flex min-h-dvh">
          <Sidebar workspaceId={workspaceId} />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
        <CommandPalette workspaceId={workspaceId} />
      </RealtimeProvider>
    </TooltipProvider>
  );
}
