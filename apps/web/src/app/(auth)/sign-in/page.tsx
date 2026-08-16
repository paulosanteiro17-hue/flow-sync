'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@flowsync/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/misc';
import { useDemoSignIn, useSignIn } from '@/features/auth/use-auth';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('next') ?? '/app';
  const signIn = useSignIn();
  const demoSignIn = useDemoSignIn();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn.mutateAsync(values);
      router.push(redirectTo);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(field as keyof SignInInput, { message });
        }
        setFormError(error.message);
        return;
      }
      setFormError('We could not reach the server. Check your connection and try again.');
    }
  });

  const onDemo = async () => {
    setFormError(null);
    try {
      await demoSignIn.mutateAsync();
      router.push('/app');
    } catch {
      setFormError('The demo workspace is unavailable on this deployment.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your FlowSync workspace</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
          />
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message} required>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            aria-invalid={Boolean(errors.password)}
            {...register('password')}
          />
        </Field>

        {formError ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Button type="submit" className="w-full" loading={isSubmitting || signIn.isPending}>
          Sign in
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        loading={demoSignIn.isPending}
        onClick={onDemo}
      >
        Explore the demo workspace
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to FlowSync?{' '}
        <Link href="/sign-up" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <SignInForm />
    </Suspense>
  );
}
