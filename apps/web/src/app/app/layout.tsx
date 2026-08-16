'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Logo } from '@/components/brand';
import { useCurrentUser } from '@/features/auth/use-auth';

/**
 * Client-side gate for the authenticated app.
 *
 * This is a redirect, not a security boundary — the API rejects unauthenticated
 * requests regardless of what the browser decides to render.
 */
export default function AppAuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      const next = encodeURIComponent(pathname);
      router.replace(`/sign-in?next=${next}`);
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading || (!user && !isError)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Logo className="size-8 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
