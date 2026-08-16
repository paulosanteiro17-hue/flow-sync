'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { BoardColumnView, TaskSummary } from '@flowsync/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TaskCard } from './task-card';

interface BoardColumnProps {
  column: BoardColumnView;
  tasks: TaskSummary[];
  canEdit: boolean;
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
  onRenameColumn: (column: BoardColumnView) => void;
  onDeleteColumn: (column: BoardColumnView) => void;
  /** True when a board filter is active, so an empty column can explain itself. */
  filtered: boolean;
}

export function BoardColumn({
  column,
  tasks,
  canEdit,
  onOpenTask,
  onAddTask,
  onRenameColumn,
  onDeleteColumn,
  filtered,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  });

  const overLimit = column.wipLimit !== null && tasks.length > column.wipLimit;

  return (
    <section
      className="flex w-[280px] shrink-0 flex-col sm:w-[300px]"
      aria-label={`${column.name} column, ${tasks.length} tasks`}
    >
      <header className="mb-2 flex items-center gap-2 px-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
          aria-hidden
        />
        <h2 className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {column.name}
        </h2>
        <span
          className={cn(
            'rounded-full px-1.5 text-[11px] tabular-nums',
            overLimit
              ? 'bg-destructive/10 font-semibold text-destructive'
              : 'text-muted-foreground/70',
          )}
          title={
            column.wipLimit !== null
              ? `${tasks.length} of ${column.wipLimit} (WIP limit)`
              : undefined
          }
        >
          {tasks.length}
          {column.wipLimit !== null ? `/${column.wipLimit}` : ''}
        </span>

        {canEdit ? (
          <div className="ml-auto flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Add task to ${column.name}`}
              onClick={() => onAddTask(column.id)}
            >
              <Plus />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`${column.name} options`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRenameColumn(column)}>
                  <Pencil />
                  Edit column
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => onDeleteColumn(column)}>
                  <Trash2 />
                  Delete column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl bg-surface p-2 transition-colors',
          isOver && 'bg-primary/5 ring-2 ring-primary/30',
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
          ))}
        </SortableContext>

        {tasks.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {filtered ? 'No tasks match the current filters' : 'Drop a task here'}
          </p>
        ) : null}

        {canEdit ? (
          <button
            type="button"
            onClick={() => onAddTask(column.id)}
            className="mt-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add task
          </button>
        ) : null}
      </div>
    </section>
  );
}
