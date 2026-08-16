'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PROJECT_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  createProjectSchema,
  suggestProjectKey,
  type CreateProjectFormInput,
  type CreateProjectInput,
} from '@flowsync/shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/form';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCreateProject } from './use-projects';

interface CreateProjectDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProjectDialog({ workspaceId, open, onOpenChange }: CreateProjectDialogProps) {
  const router = useRouter();
  const createProject = useCreateProject(workspaceId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
    // The form binds to the schema's *input* type (defaults not yet applied);
    // `handleSubmit` hands the service the parsed output type.
  } = useForm<CreateProjectFormInput, unknown, CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: '',
      key: '',
      status: 'PLANNING',
      color: PROJECT_COLORS[0],
      memberIds: [],
    },
  });

  const name = watch('name');
  const color = watch('color');
  const keyValue = watch('key');

  // Suggest a key from the name until the user types their own.
  useEffect(() => {
    if (!name) return;
    const suggestion = suggestProjectKey(name);
    const previousSuggestion = suggestProjectKey(name.slice(0, -1));
    if (!keyValue || keyValue === previousSuggestion) {
      setValue('key', suggestion, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const project = await createProject.mutateAsync(values);
      toast.success(`${project.name} created`);
      onOpenChange(false);
      router.push(`/app/${workspaceId}/projects/${project.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(field as keyof CreateProjectInput, { message });
        }
        if (error.status === 409) setError('key', { message: error.message });
        else toast.error(error.message);
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A board with the default workflow columns is created automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Name" htmlFor="project-name" error={errors.name?.message} required>
            <Input
              id="project-name"
              placeholder="Website Redesign"
              autoFocus
              {...register('name')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Key"
              htmlFor="project-key"
              error={errors.key?.message}
              hint="Used for task ids, e.g. WEB-101"
              required
            >
              <Input
                id="project-key"
                placeholder="WEB"
                className="font-mono uppercase"
                {...register('key')}
              />
            </Field>

            <Field label="Status" htmlFor="project-status">
              <Select
                defaultValue="PLANNING"
                onValueChange={(value) =>
                  setValue('status', value as CreateProjectInput['status'])
                }
              >
                <SelectTrigger id="project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.filter((status) => status !== 'ARCHIVED').map((status) => (
                    <SelectItem key={status} value={status}>
                      {PROJECT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description" htmlFor="project-description">
            <Textarea
              id="project-description"
              rows={2}
              placeholder="What is this project for?"
              {...register('description')}
            />
          </Field>

          <Field label="Colour" htmlFor="project-color">
            <div id="project-color" className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Use colour ${option}`}
                  aria-pressed={color === option}
                  onClick={() => setValue('color', option)}
                  className={cn(
                    'size-7 rounded-md transition-transform',
                    color === option && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: option }}
                />
              ))}
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createProject.isPending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
