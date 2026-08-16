'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createWorkspaceSchema, type CreateWorkspaceInput } from '@flowsync/shared';
import { ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';
import { ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/features/auth/use-auth';
import { useCreateWorkspace } from '@/features/workspaces/use-workspaces';

/**
 * First-run flow: create a workspace. A default project, board and columns follow
 * from the first project the user creates, so this stays a single decision.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();
  const createWorkspace = useCreateWorkspace();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (!isLoading && !user) router.replace('/sign-in');
  }, [user, isLoading, router]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const workspace = await createWorkspace.mutateAsync(values);
      toast.success(`${workspace.name} is ready`);
      router.push(`/app/${workspace.id}/projects?new=1`);
    } catch (error) {
      setError('name', {
        message: error instanceof ApiError ? error.message : 'The workspace could not be created.',
      });
    }
  });

  const steps = [
    'Create your workspace',
    'Add your first project',
    'Invite the people you work with',
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{user ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A workspace is where your projects, boards and team live.
          </p>

          <ol className="mt-6 space-y-2">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2.5 text-sm">
                <span
                  className={
                    index === 0
                      ? 'flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground'
                      : 'flex size-5 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground'
                  }
                >
                  {index === 0 ? <Check className="size-3" /> : index + 1}
                </span>
                <span className={index === 0 ? 'font-medium' : 'text-muted-foreground'}>{step}</span>
              </li>
            ))}
          </ol>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <Field
              label="Workspace name"
              htmlFor="workspace-name"
              error={errors.name?.message}
              hint="Usually your company or team name."
              required
            >
              <Input
                id="workspace-name"
                placeholder="Northstar Labs"
                autoFocus
                {...register('name')}
              />
            </Field>

            <Button
              type="submit"
              className="w-full"
              loading={isSubmitting || createWorkspace.isPending}
            >
              Create workspace
              <ArrowRight />
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
