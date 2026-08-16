'use client';

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  can,
  humanFileSize,
  tokenizeMentions,
  type LabelView,
  type TaskPriority,
  type WorkspaceMemberView,
  type WorkspaceRole,
} from '@flowsync/shared';
import {
  Download,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UserAvatar } from '@/components/ui/avatar';
import { LabelChip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DrawerContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import {
  Checkbox,
  EmptyState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Separator,
  Skeleton,
} from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, formatDate, relativeTime } from '@/lib/utils';
import { useCurrentUser } from '@/features/auth/use-auth';
import {
  useAttachmentMutations,
  useAttachments,
  useCommentMutations,
  useComments,
} from '@/features/comments/use-comments';
import { useSubtasks, useTask, useUpdateTask } from './use-tasks';

interface TaskDrawerProps {
  workspaceId: string;
  boardId: string | null;
  taskId: string | null;
  role: WorkspaceRole | undefined;
  members: WorkspaceMemberView[];
  labels: LabelView[];
  onClose: () => void;
}

export function TaskDrawer({
  workspaceId,
  boardId,
  taskId,
  role,
  members,
  labels,
  onClose,
}: TaskDrawerProps) {
  const { data: task, isLoading } = useTask(workspaceId, taskId);
  const updateTask = useUpdateTask(workspaceId, boardId);
  const canEdit = can(role, 'task:update');

  return (
    <Dialog open={Boolean(taskId)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent aria-describedby={undefined}>
        {isLoading || !task ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
              <span className="font-mono text-xs font-medium text-muted-foreground">{task.key}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="truncate text-xs text-muted-foreground">
                {task.projectName} / {task.columnName}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label="Close task"
                onClick={onClose}
              >
                <X />
              </Button>
            </header>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <div className="space-y-6 px-4 py-5 sm:px-6">
                <TitleField
                  value={task.title}
                  disabled={!canEdit}
                  onSave={(title) => updateTask.mutate({ taskId: task.id, input: { title } })}
                />

                <MetaGrid
                  task={task}
                  members={members}
                  labels={labels}
                  disabled={!canEdit}
                  onChange={(input) => updateTask.mutate({ taskId: task.id, input })}
                />

                <DescriptionField
                  value={task.description}
                  disabled={!canEdit}
                  onSave={(description) =>
                    updateTask.mutate({ taskId: task.id, input: { description } })
                  }
                />

                <Separator />

                <SubtaskList
                  workspaceId={workspaceId}
                  boardId={boardId}
                  taskId={task.id}
                  subtasks={task.subtasks}
                  disabled={!canEdit}
                />

                <Separator />

                <AttachmentList
                  workspaceId={workspaceId}
                  taskId={task.id}
                  canUpload={can(role, 'attachment:create')}
                />

                <Separator />

                <CommentThread workspaceId={workspaceId} taskId={task.id} role={role} />
              </div>
            </div>

            <DialogTitle className="sr-only">{task.title}</DialogTitle>
          </>
        )}
      </DrawerContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function TitleField({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (title: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    onSave(trimmed);
  };

  return (
    <Textarea
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      aria-label="Task title"
      rows={1}
      className="min-h-0 resize-none border-0 px-0 text-xl font-semibold leading-snug shadow-none focus-visible:border-0 disabled:opacity-100"
    />
  );
}

function MetaGrid({
  task,
  members,
  labels,
  disabled,
  onChange,
}: {
  task: { priority: TaskPriority; dueDate: string | null; assignees: Array<{ id: string; name: string; avatarUrl: string | null }>; labels: LabelView[]; creator: { id: string; name: string; avatarUrl: string | null }; createdAt: string };
  members: WorkspaceMemberView[];
  labels: LabelView[];
  disabled: boolean;
  onChange: (input: Record<string, unknown>) => void;
}) {
  const assigneeIds = task.assignees.map((assignee) => assignee.id);
  const labelIds = task.labels.map((label) => label.id);

  return (
    <dl className="grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-3 text-sm">
      <dt className="text-xs font-medium text-muted-foreground">Priority</dt>
      <dd>
        <Select
          value={task.priority}
          disabled={disabled}
          onValueChange={(value) => onChange({ priority: value })}
        >
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {TASK_PRIORITY_LABELS[priority]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </dd>

      <dt className="text-xs font-medium text-muted-foreground">Assignees</dt>
      <dd>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-2" disabled={disabled}>
              {task.assignees.length === 0 ? (
                <span className="text-xs text-muted-foreground">Unassigned</span>
              ) : (
                <>
                  <span className="flex -space-x-1.5">
                    {task.assignees.slice(0, 3).map((assignee) => (
                      <UserAvatar key={assignee.id} user={assignee} size="xs" decorative />
                    ))}
                  </span>
                  <span className="text-xs">
                    {task.assignees.length === 1
                      ? task.assignees[0]?.name
                      : `${task.assignees.length} people`}
                  </span>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-1.5">
            <div className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-thin">
              {members.map((member) => (
                <label
                  key={member.user.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/60"
                >
                  <Checkbox
                    checked={assigneeIds.includes(member.user.id)}
                    onCheckedChange={() =>
                      onChange({
                        assigneeIds: assigneeIds.includes(member.user.id)
                          ? assigneeIds.filter((id) => id !== member.user.id)
                          : [...assigneeIds, member.user.id],
                      })
                    }
                  />
                  <UserAvatar user={member.user} size="xs" decorative />
                  <span className="truncate">{member.user.name}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </dd>

      <dt className="text-xs font-medium text-muted-foreground">Due date</dt>
      <dd>
        <Input
          type="date"
          disabled={disabled}
          aria-label="Due date"
          value={task.dueDate ? task.dueDate.slice(0, 10) : ''}
          onChange={(event) =>
            onChange({
              dueDate: event.target.value
                ? new Date(`${event.target.value}T17:00:00`).toISOString()
                : null,
            })
          }
          className="h-8 w-44 text-xs"
        />
      </dd>

      <dt className="text-xs font-medium text-muted-foreground">Labels</dt>
      <dd className="flex flex-wrap items-center gap-1.5">
        {task.labels.map((label) => (
          <LabelChip key={label.id} name={label.name} color={label.color} />
        ))}
        {disabled ? null : (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Edit labels">
                <Plus />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1.5">
              <div className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-thin">
                {labels.map((label) => (
                  <label
                    key={label.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent/60"
                  >
                    <Checkbox
                      checked={labelIds.includes(label.id)}
                      onCheckedChange={() =>
                        onChange({
                          labelIds: labelIds.includes(label.id)
                            ? labelIds.filter((id) => id !== label.id)
                            : [...labelIds, label.id],
                        })
                      }
                    />
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                      aria-hidden
                    />
                    {label.name}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </dd>

      <dt className="text-xs font-medium text-muted-foreground">Created</dt>
      <dd className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserAvatar user={task.creator} size="xs" decorative />
        {task.creator.name} · {formatDate(task.createdAt)}
      </dd>
    </dl>
  );
}

function DescriptionField({
  value,
  disabled,
  onSave,
}: {
  value: string | null;
  disabled: boolean;
  onSave: (description: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => setDraft(value ?? ''), [value]);

  if (!editing) {
    return (
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h3>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setEditing(true)}
          className={cn(
            'w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm',
            !disabled && 'hover:border-border hover:bg-accent/40',
          )}
        >
          {value ? (
            <span className="whitespace-pre-wrap">{value}</span>
          ) : (
            <span className="text-muted-foreground">
              {disabled ? 'No description' : 'Add a description…'}
            </span>
          )}
        </button>
      </section>
    );
  }

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Description
      </h3>
      <Textarea
        value={draft}
        autoFocus
        rows={5}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Task description"
      />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft.trim() || null);
            setEditing(false);
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(value ?? '');
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}

function SubtaskList({
  workspaceId,
  boardId,
  taskId,
  subtasks,
  disabled,
}: {
  workspaceId: string;
  boardId: string | null;
  taskId: string;
  subtasks: Array<{ id: string; title: string; completed: boolean }>;
  disabled: boolean;
}) {
  const { create, update, remove } = useSubtasks(workspaceId, taskId, boardId);
  const [title, setTitle] = useState('');

  const completed = subtasks.filter((subtask) => subtask.completed).length;
  const progress = subtasks.length === 0 ? 0 : (completed / subtasks.length) * 100;

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Subtasks
        </h3>
        {subtasks.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {completed} / {subtasks.length} completed
          </span>
        ) : null}
      </div>

      {subtasks.length > 0 ? <Progress value={progress} className="mb-3" /> : null}

      <ul className="space-y-0.5">
        {subtasks.map((subtask) => (
          <li key={subtask.id} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/40">
            <Checkbox
              checked={subtask.completed}
              disabled={disabled}
              aria-label={subtask.title}
              onCheckedChange={(checked) =>
                update.mutate({ subtaskId: subtask.id, input: { completed: checked === true } })
              }
            />
            <span
              className={cn(
                'flex-1 text-sm',
                subtask.completed && 'text-muted-foreground line-through',
              )}
            >
              {subtask.title}
            </span>
            {disabled ? null : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Delete subtask ${subtask.title}`}
                onClick={() => remove.mutate(subtask.id)}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {disabled ? null : (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            create.mutate({ title: title.trim() });
            setTitle('');
          }}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a subtask"
            className="h-8 text-sm"
            aria-label="New subtask"
          />
          <Button type="submit" size="sm" variant="outline" disabled={!title.trim()}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}

function AttachmentList({
  workspaceId,
  taskId,
  canUpload,
}: {
  workspaceId: string;
  taskId: string;
  canUpload: boolean;
}) {
  const { data: attachments, isLoading } = useAttachments(workspaceId, taskId);
  const { upload, remove } = useAttachmentMutations(workspaceId, taskId);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Attachments
        </h3>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                upload.mutate(file, {
                  onSuccess: () => toast.success(`${file.name} uploaded`),
                });
                event.target.value = '';
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7"
              loading={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="size-3.5" />
              Upload
            </Button>
          </>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments && attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="group flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{attachment.filename}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {humanFileSize(attachment.size)} · {attachment.uploadedBy.name} ·{' '}
                  {relativeTime(attachment.createdAt)}
                </span>
              </span>
              <a
                href={attachment.downloadUrl}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`Download ${attachment.filename}`}
              >
                <Download className="size-3.5" />
              </a>
              {canUpload ? (
                <button
                  type="button"
                  onClick={() => remove.mutate(attachment.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${attachment.filename}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No files attached.</p>
      )}
    </section>
  );
}

function CommentThread({
  workspaceId,
  taskId,
  role,
}: {
  workspaceId: string;
  taskId: string;
  role: WorkspaceRole | undefined;
}) {
  const { data: currentUser } = useCurrentUser();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useComments(
    workspaceId,
    taskId,
  );
  const { create, remove } = useCommentMutations(workspaceId, taskId);
  const [body, setBody] = useState('');

  const comments = data?.pages.flatMap((page) => page.items) ?? [];
  const canComment = can(role, 'comment:create');
  const canDeleteAny = can(role, 'comment:delete_any');

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Comments
      </h3>

      {canComment ? (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            create.mutate(body.trim(), { onSuccess: () => setBody('') });
          }}
        >
          {currentUser ? <UserAvatar user={currentUser} size="sm" decorative /> : null}
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a comment…"
            rows={2}
            aria-label="Write a comment"
            className="min-h-0 flex-1 text-sm"
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                if (body.trim()) create.mutate(body.trim(), { onSuccess: () => setBody('') });
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!body.trim()}
            loading={create.isPending}
            aria-label="Post comment"
          >
            <Send />
          </Button>
        </form>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-4/5" />
        </div>
      ) : comments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description={canComment ? 'Start the conversation.' : 'Nothing has been discussed here.'}
          className="border-0 py-6"
        />
      ) : (
        <ul className="space-y-4">
          {comments.map((comment) => (
            <li key={comment.id} className="group flex gap-2.5">
              <UserAvatar user={comment.author} size="sm" decorative />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{comment.author.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {relativeTime(comment.createdAt)}
                    {comment.editedAt ? ' · edited' : ''}
                  </span>
                  {comment.author.id === currentUser?.id || canDeleteAny ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Delete comment"
                      onClick={() => remove.mutate(comment.id)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed">
                  {tokenizeMentions(comment.body).map((token, index) =>
                    token.type === 'mention' ? (
                      <span
                        key={`${token.userId}-${index}`}
                        className="rounded bg-primary/10 px-1 font-medium text-primary"
                      >
                        @{token.value}
                      </span>
                    ) : (
                      <span key={index}>{token.value}</span>
                    ),
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 w-full"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
          Load older comments
        </Button>
      ) : null}
    </section>
  );
}
