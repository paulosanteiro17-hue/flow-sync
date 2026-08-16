'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Logo } from '@/components/brand';
import { ErrorState } from '@/components/ui/misc';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';

/** Entry point: send people to their workspace, or to onboarding if they have none. */
export default function AppIndexPage() {
  const router = useRouter();
  const { data: workspaces, isLoading, isError, refetch } = useWorkspaces();

  useEffect(() => {
    if (!workspaces) return;
    const first = workspaces[0];
    router.replace(first ? `/app/${first.id}` : '/onboarding');
  }, [workspaces, router]);

  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState
          message="We could not load your workspaces."
          onRetry={() => void refetch()}
          className="max-w-sm"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-8 animate-pulse" />
        <p className="text-sm text-muted-foreground">
          {isLoading ? 'Loading your workspaces…' : 'Opening your workspace…'}
        </p>
      </div>
    </div>
  );
}
