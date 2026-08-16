'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
});

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * One accessible field wrapper used by every form: the label is always bound to
 * the control, and the error is announced and wired through `aria-describedby`
 * rather than being colour-only.
 */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  const describedBy = [error ? `${htmlFor}-error` : null, hint ? `${htmlFor}-hint` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>

      <div
        data-described-by={describedBy || undefined}
        className="[&>*]:aria-[invalid=true]:border-destructive"
      >
        {children}
      </div>

      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
