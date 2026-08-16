'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { TASK_PRIORITY_LABELS, type TaskPriority, type TaskSummary } from '@flowsync/shared';
import { memo } from 'react';
import { AvatarGroup } from '@/components/ui/avatar';
import { LabelChip } from '@/components/ui/badge';
import { cn, describeDueDate } from '@/lib/utils';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  URGENT: 'bg-[var(--priority-urgent)]',
  HIGH: 'bg-[var(--priority-high)]',
  MEDIUM: 'bg-[var(--priority-medium)]',
  LOW: 'bg-[var(--priority-low)]',
  NONE: 'bg-[var(--priority-none)]',
};

const DUE_TONE = {
  overdue: 'text-destructive font-medium',
  today: 'text-amber-600 dark:text-amber-400 font-medium',
  soon: 'text-muted-foreground',
  future: 'text-muted-foreground',
} as const;

interface TaskCardProps {
  task: TaskSummary;
  onOpen: (taskId: string) => void;
  /** Rendered inside the drag overlay: no sortable wiring, no hover affordances. */
  overlay?: boolean;
}

/**
 * A board card.
 *
 * Memoised because a busy board re-renders on every realtime event; without it, a
 * single card move would re-render every card on the board.
 */
export const TaskCard = memo(function TaskCard({ task, onOpen, overlay }: TaskCardProps) {
  const sortable = useSortable({
    id: task.id,
    data: { type: 'task', task },
    disabled: overlay,
  });

  const due = describeDueDate(task.dueDate);
  const hasSubtasks = task.subtaskCount > 0;

  const style = overlay
    ? undefined
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      };

  return (
    <article
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      {...(overlay ? {} : sortable.attributes)}
      {...(overlay ? {} : sortable.listeners)}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event) => {
        // Enter opens the task; Space is left to dnd-kit's keyboard sensor so a
        // card can still be picked up and moved without a pointer.
        if (event.key === 'Enter') {
          event.preventDefault();
          onOpen(task.id);
          return;
        }
        if (!overlay) sortable.listeners?.onKeyDown?.(event);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${task.key}: ${task.title}. Priority ${TASK_PRIORITY_LABELS[task.priority]}.`}
      className={cn(
        'group cursor-grab touch-manipulation rounded-lg border border-border bg-card p-2.5 text-left shadow-sm transition-shadow',
        'hover:border-border hover:shadow-md active:cursor-grabbing',
        overlay && 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-primary/40',
        !overlay && sortable.isDragging && 'opacity-40',
        task.isDone && 'opacity-75',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn('size-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])}
          title={TASK_PRIORITY_LABELS[task.priority]}
          aria-hidden
        />
        <span className="font-mono text-[10px] font-medium text-muted-foreground">{task.key}</span>
        {due ? (
          <span className={cn('ml-auto text-[10px]', DUE_TONE[due.tone])}>{due.label}</span>
        ) : null}
      </div>

      <p
        className={cn(
          'text-[13px] leading-snug font-medium text-card-foreground',
          task.isDone && 'line-through decoration-muted-foreground/60',
        )}
      >
        {task.title}
      </p>

      {task.labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
          {task.labels.length > 3 ? (
            <span className="text-[10px] text-muted-foreground">+{task.labels.length - 3}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-muted-foreground">
        {hasSubtasks ? (
          <span className="flex items-center gap-1" title="Subtasks completed">
            <CheckSquare className="size-3" />
            {task.completedSubtaskCount}/{task.subtaskCount}
          </span>
        ) : null}

        {task.commentCount > 0 ? (
          <span className="flex items-center gap-1" title="Comments">
            <MessageSquare className="size-3" />
            {task.commentCount}
          </span>
        ) : null}

        {task.attachmentCount > 0 ? (
          <span className="flex items-center gap-1" title="Attachments">
            <Paperclip className="size-3" />
            {task.attachmentCount}
          </span>
        ) : null}

        {task.assignees.length > 0 ? (
          <AvatarGroup users={task.assignees} size="xs" className="ml-auto" />
        ) : null}
      </div>
    </article>
  );
});
