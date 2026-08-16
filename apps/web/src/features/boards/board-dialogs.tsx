'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type BoardColumnView,
  type BoardSnapshot,
  type CreateTaskInput,
  type LabelView,
  type TaskPriority,
  type WorkspaceMemberView,
} from '@flowsync/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
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
import { Checkbox } from '@/components/ui/misc';
import { UserAvatar } from '@/components/ui/avatar';
import { useCreateTask } from '@/features/tasks/use-tasks';

// ---------------------------------------------------------------------------
// Create task
// ---------------------------------------------------------------------------

interface CreateTaskDialogProps {
  workspaceId: string;
  boardId: string;
  columnId: string | null;
  members: WorkspaceMemberView[];
  labels: LabelView[];
  onOpenChange: (open: boolean) => void;
}

export function CreateTaskDialog({
  workspaceId,
  boardId,
  columnId,
  members,
  labels,
  onOpenChange,
}: CreateTaskDialogProps) {
  const createTask = useCreateTask(workspaceId, boardId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NONE');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (columnId) {
      setTitle('');
      setDescription('');
      setPriority('NONE');
      setDueDate('');
      setAssigneeIds([]);
      setLabelIds([]);
      setError(null);
    }
  }, [columnId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!columnId) return;

    if (!title.trim()) {
      setError('Give the task a title');
      return;
    }

    const input: CreateTaskInput = {
      columnId,
      title: title.trim(),
      priority,
      assigneeIds,
      labelIds,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(dueDate ? { dueDate: new Date(`${dueDate}T17:00:00`).toISOString() } : {}),
    } as CreateTaskInput;

    try {
      const task = await createTask.mutateAsync(input);
      toast.success(`${task.key} created`);
      onOpenChange(false);
    } catch {
      setError('The task could not be created. Please try again.');
    }
  };

  return (
    <Dialog open={Boolean(columnId)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>It will be added to the end of this column.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Title" htmlFor="task-title" required error={error ?? undefined}>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Fix notification race condition"
              autoFocus
            />
          </Field>

          <Field label="Description" htmlFor="task-description">
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What needs to happen, and how will we know it is done?"
              rows={3}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" htmlFor="task-priority">
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TASK_PRIORITY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Due date" htmlFor="task-due">
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Assignees" htmlFor="task-assignees">
            <div
              id="task-assignees"
              className="max-h-32 space-y-0.5 overflow-y-auto scrollbar-thin rounded-md border border-border p-1.5"
            >
              {members.map((member) => (
                <label
                  key={member.user.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/60"
                >
                  <Checkbox
                    checked={assigneeIds.includes(member.user.id)}
                    onCheckedChange={() =>
                      setAssigneeIds((current) =>
                        current.includes(member.user.id)
                          ? current.filter((id) => id !== member.user.id)
                          : [...current, member.user.id],
                      )
                    }
                  />
                  <UserAvatar user={member.user} size="xs" decorative />
                  {member.user.name}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Labels" htmlFor="task-labels">
            <div id="task-labels" className="flex flex-wrap gap-1.5">
              {labels.map((label) => {
                const selected = labelIds.includes(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() =>
                      setLabelIds((current) =>
                        current.includes(label.id)
                          ? current.filter((id) => id !== label.id)
                          : [...current, label.id],
                      )
                    }
                    aria-pressed={selected}
                    className="rounded-full px-2 py-0.5 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: selected
                        ? `color-mix(in oklch, ${label.color} 22%, transparent)`
                        : 'transparent',
                      color: label.color,
                      boxShadow: `inset 0 0 0 1px ${selected ? label.color : 'var(--border)'}`,
                    }}
                  >
                    {label.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createTask.isPending}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Column dialogs
// ---------------------------------------------------------------------------

interface ColumnDialogProps {
  workspaceId: string;
  boardId: string;
  /** `null` while closed, an existing column to edit, or `'new'` to create one. */
  target: BoardColumnView | 'new' | null;
  onOpenChange: (open: boolean) => void;
}

export function ColumnDialog({ workspaceId, boardId, target, onOpenChange }: ColumnDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = target !== null && target !== 'new';

  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const [isDone, setIsDone] = useState(false);
  const [wipLimit, setWipLimit] = useState('');

  useEffect(() => {
    if (target === 'new') {
      setName('');
      setColor(DEFAULT_COLUMNS[1].color);
      setIsDone(false);
      setWipLimit('');
    } else if (target) {
      setName(target.name);
      setColor(target.color);
      setIsDone(target.isDone);
      setWipLimit(target.wipLimit === null ? '' : String(target.wipLimit));
    }
  }, [target]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        color,
        isDone,
        wipLimit: wipLimit ? Number.parseInt(wipLimit, 10) : null,
      };

      if (isEditing) {
        return api.patch(`/workspaces/${workspaceId}/columns/${target.id}`, payload);
      }
      return api.post(`/workspaces/${workspaceId}/boards/${boardId}/columns`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(workspaceId, boardId) });
      onOpenChange(false);
    },
    onError: () => toast.error('The column could not be saved.'),
  });

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit column' : 'New column'}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) mutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Name" htmlFor="column-name" required>
            <Input
              id="column-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="In Review"
              autoFocus
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Colour" htmlFor="column-color">
              <Input
                id="column-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-full cursor-pointer p-1"
              />
            </Field>

            <Field
              label="WIP limit"
              htmlFor="column-wip"
              hint="Optional. Highlights the column when exceeded."
            >
              <Input
                id="column-wip"
                type="number"
                min={1}
                max={999}
                value={wipLimit}
                onChange={(event) => setWipLimit(event.target.value)}
                placeholder="None"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3">
            <Checkbox
              checked={isDone}
              onCheckedChange={(checked) => setIsDone(checked === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium">Completion column</span>
              <span className="block text-xs text-muted-foreground">
                Tasks moved here count as completed in dashboards and filters.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEditing ? 'Save changes' : 'Add column'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteColumnDialogProps {
  workspaceId: string;
  boardId: string;
  column: BoardColumnView | null;
  snapshot: BoardSnapshot | undefined;
  onOpenChange: (open: boolean) => void;
}

export function DeleteColumnDialog({
  workspaceId,
  boardId,
  column,
  snapshot,
  onOpenChange,
}: DeleteColumnDialogProps) {
  const queryClient = useQueryClient();
  const [moveTo, setMoveTo] = useState('');

  const taskCount = snapshot?.tasks.filter((task) => task.columnId === column?.id).length ?? 0;
  const otherColumns = snapshot?.columns.filter((candidate) => candidate.id !== column?.id) ?? [];

  useEffect(() => {
    setMoveTo(otherColumns[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      api.delete(
        `/workspaces/${workspaceId}/columns/${column?.id}${
          taskCount > 0 ? `?moveTasksTo=${moveTo}` : ''
        }`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(workspaceId, boardId) });
      onOpenChange(false);
    },
    onError: () => toast.error('The column could not be deleted.'),
  });

  return (
    <Dialog open={column !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{column?.name}”</DialogTitle>
          <DialogDescription>
            {taskCount > 0
              ? `This column still holds ${taskCount} task${taskCount === 1 ? '' : 's'}. Choose where they should go.`
              : 'This column is empty and can be removed safely.'}
          </DialogDescription>
        </DialogHeader>

        {taskCount > 0 ? (
          <Field label="Move tasks to" htmlFor="move-tasks-to">
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="move-tasks-to">
                <SelectValue placeholder="Select a column" />
              </SelectTrigger>
              <SelectContent>
                {otherColumns.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={mutation.isPending}
            disabled={taskCount > 0 && !moveTo}
            onClick={() => mutation.mutate()}
          >
            Delete column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
