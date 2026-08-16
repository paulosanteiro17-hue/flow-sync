'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type WorkspaceRole,
  type WorkspaceSummary,
} from '@flowsync/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/misc';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApiError, api } from '@/lib/api-client';
import { useCurrentUser } from '@/features/auth/use-auth';

interface InvitationPreview {
  workspaceName: string;
  role: WorkspaceRole;
  email: string;
  invitedBy: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();

  const {
    data: invitation,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.get<InvitationPreview>(`/invitations/${token}`),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.post<WorkspaceSummary>('/invitations/accept', { token }),
    onSuccess: (workspace) => {
      toast.success(`You joined ${workspace.name}`);
      router.push(`/app/${workspace.id}`);
    },
    onError: (caught) =>
      toast.error(
        caught instanceof ApiError ? caught.message : 'The invitation could not be accepted.',
      ),
  });

  const emailMatches = user?.email.toLowerCase() === invitation?.email.toLowerCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="FlowSync home">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : isError || !invitation ? (
            <ErrorState
              title="This invitation is not valid"
              message={
                error instanceof ApiError
                  ? error.message
                  : 'The link may have expired or already been used.'
              }
            />
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">
                Join {invitation.workspaceName}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {invitation.invitedBy} invited <strong>{invitation.email}</strong> to collaborate.
              </p>

              <div className="mt-6 rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-medium">Your role: {ROLE_LABELS[invitation.role]}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[invitation.role]}
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {userLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : !user ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Sign in as {invitation.email} to accept.
                    </p>
                    <Button asChild className="w-full">
                      <Link href={`/sign-in?next=/invite/${token}`}>
                        Sign in
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/sign-up?next=/invite/${token}`}>Create an account</Link>
                    </Button>
                  </>
                ) : emailMatches ? (
                  <Button
                    className="w-full"
                    loading={accept.isPending}
                    onClick={() => accept.mutate()}
                  >
                    Accept invitation
                    <ArrowRight />
                  </Button>
                ) : (
                  <>
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      You are signed in as {user.email}, but this invitation was sent to{' '}
                      {invitation.email}.
                    </p>
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/sign-in?next=/invite/${token}`}>
                        Sign in with a different account
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
