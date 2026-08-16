'use client';

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type MyTasksQuery,
  type TaskPriority,
} from '@flowsync/shared';
import { CheckSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { LabelChip } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMyTasks } from '@/features/tasks/use-tasks';
import { cn, describeDueDate } from '@/lib/utils';

type Bucket = NonNullable<MyTasksQuery['bucket']>;

const BUCKETS: Array<{ value: Bucket; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
];

function MyTasksInner() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const searchParams = useSearchParams();

  const [bucket, setBucket] = useState<Bucket>((searchParams.get('bucket') as Bucket) ?? 'all');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<TaskPriority | 'ALL'>('ALL');
  const [sort, setSort] = useState<NonNullable<MyTasksQuery['sort']>>('due');

  const {
    data: tasks,
    isLoading,
    isError,
    refetch,
  } = useMyTasks(workspaceId, {
    bucket,
    sort,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(priority === 'ALL' ? {} : { priority }),
  });

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        <h1 className="truncate text-sm font-semibold">My Tasks</h1>
      </Topbar>

      <main className="flex-1 scrollbar-thin overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <nav className="flex flex-wrap gap-1" aria-label="Task buckets">
            {BUCKETS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setBucket(option.value)}
                aria-pressed={bucket === option.value}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  bucket === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search my tasks…"
              className="h-9 w-full sm:max-w-xs"
              aria-label="Search my tasks"
            />

            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as TaskPriority | 'ALL')}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Filter by priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any priority</SelectItem>
                {TASK_PRIORITIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {TASK_PRIORITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger className="h-9 w-40" aria-label="Sort tasks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="created">Recently created</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isError ? (
            <ErrorState message="Your tasks could not be loaded." onRetry={() => void refetch()} />
          ) : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <EmptyState
              icon={<CheckSquare />}
              title={bucket === 'completed' ? 'Nothing completed yet' : 'Nothing here'}
              description={
                search || priority !== 'ALL'
                  ? 'No tasks match these filters.'
                  : 'Tasks assigned to you will appear here.'
              }
            />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {tasks.map((task) => {
                const due = describeDueDate(task.dueDate);
                return (
                  <li key={task.id}>
                    <Link
                      href={`/app/${workspaceId}/boards/${task.boardId}?task=${task.id}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {task.key}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm font-medium',
                          task.isDone && 'text-muted-foreground line-through',
                        )}
                      >
                        {task.title}
                      </span>

                      {task.labels.slice(0, 2).map((label) => (
                        <LabelChip key={label.id} name={label.name} color={label.color} />
                      ))}

                      <span className="text-xs text-muted-foreground">
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>

                      {due ? (
                        <span
                          className={cn(
                            'w-20 text-right text-xs',
                            due.tone === 'overdue'
                              ? 'font-medium text-destructive'
                              : due.tone === 'today'
                                ? 'font-medium text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground',
                          )}
                        >
                          {due.label}
                        </span>
                      ) : (
                        <span className="w-20" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense fallback={null}>
      <MyTasksInner />
    </Suspense>
  );
}
