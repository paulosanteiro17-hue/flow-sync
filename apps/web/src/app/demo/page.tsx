'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { useDemoSignIn } from '@/features/auth/use-auth';

/**
 * The recruiter path: one click from the landing page into a populated workspace,
 * signed in as the demo owner. No form, no seeding, no configuration.
 */
export default function DemoPage() {
  const router = useRouter();
  const demoSignIn = useDemoSignIn();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    demoSignIn
      .mutateAsync()
      .then(() => router.replace('/app'))
      .catch(() =>
        setError(
          'The demo workspace is not available on this deployment. You can still create an account.',
        ),
      );
  }, [demoSignIn, router]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Logo className="size-10" />

      {error ? (
        <>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Demo unavailable</h1>
            <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => router.push('/sign-up')}>Create an account</Button>
            <Button variant="outline" onClick={() => router.push('/')}>
              Back home
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Opening the demo workspace…</h1>
            <p className="text-sm text-muted-foreground">
              Signing you in to Northstar Labs as Emma Carter.
            </p>
          </div>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
          <style>{`@keyframes loading { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }`}</style>
        </>
      )}
    </main>
  );
}
