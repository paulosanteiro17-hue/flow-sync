'use client';

import { Filter, Search, X } from 'lucide-react';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type LabelView,
  type PresenceUser,
  type TaskPriority,
  type WorkspaceMemberView,
} from '@flowsync/shared';
import { AvatarGroup } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, Popover, PopoverContent, PopoverTrigger, Separator } from '@/components/ui/misc';
import { countActiveFilters, useUiStore, type BoardFilters } from '@/stores/ui-store';
import { cn, pluralize } from '@/lib/utils';

const DUE_OPTIONS: Array<{ value: BoardFilters['due']; label: string }> = [
  { value: 'any', label: 'Any time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'none', label: 'No due date' },
];

interface BoardToolbarProps {
  members: WorkspaceMemberView[];
  labels: LabelView[];
  presence: PresenceUser[];
  taskCount: number;
  visibleCount: number;
}

export function BoardToolbar({
  members,
  labels,
  presence,
  taskCount,
  visibleCount,
}: BoardToolbarProps) {
  const filters = useUiStore((state) => state.boardFilters);
  const setFilters = useUiStore((state) => state.setBoardFilters);
  const reset = useUiStore((state) => state.resetBoardFilters);
  const activeCount = countActiveFilters(filters);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder="Filter cards…"
          aria-label="Filter cards on this board"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="size-3.5" />
            Filters
            {activeCount > 0 ? (
              <Badge className="ml-0.5 px-1.5 py-0 text-[10px]">{activeCount}</Badge>
            ) : null}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-0">
          <div className="max-h-[26rem] scrollbar-thin overflow-y-auto p-3">
            <FilterSection title="Priority">
              {TASK_PRIORITIES.map((priority) => (
                <FilterRow
                  key={priority}
                  checked={filters.priorities.includes(priority)}
                  onChange={() =>
                    setFilters({ priorities: toggle<TaskPriority>(filters.priorities, priority) })
                  }
                  label={TASK_PRIORITY_LABELS[priority]}
                />
              ))}
            </FilterSection>

            <Separator className="my-3" />

            <FilterSection title="Assignee">
              {members.map((member) => (
                <FilterRow
                  key={member.user.id}
                  checked={filters.assigneeIds.includes(member.user.id)}
                  onChange={() =>
                    setFilters({ assigneeIds: toggle(filters.assigneeIds, member.user.id) })
                  }
                  label={member.user.name}
                />
              ))}
            </FilterSection>

            <Separator className="my-3" />

            <FilterSection title="Label">
              {labels.map((label) => (
                <FilterRow
                  key={label.id}
                  checked={filters.labelIds.includes(label.id)}
                  onChange={() => setFilters({ labelIds: toggle(filters.labelIds, label.id) })}
                  label={
                    <span className="flex items-center gap-1.5">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: label.color }}
                        aria-hidden
                      />
                      {label.name}
                    </span>
                  }
                />
              ))}
            </FilterSection>

            <Separator className="my-3" />

            <FilterSection title="Due date">
              {DUE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/60"
                >
                  <input
                    type="radio"
                    name="due-filter"
                    className="size-3.5 accent-[var(--primary)]"
                    checked={filters.due === option.value}
                    onChange={() => setFilters({ due: option.value })}
                  />
                  {option.label}
                </label>
              ))}
            </FilterSection>
          </div>

          {activeCount > 0 ? (
            <div className="border-t border-border p-2">
              <Button variant="ghost" size="sm" className="w-full" onClick={reset}>
                <X className="size-3.5" />
                Clear all filters
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {activeCount > 0 ? (
        <span className="text-xs text-muted-foreground">
          {visibleCount} of {pluralize(taskCount, 'task')}
        </span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {presence.length > 0 ? (
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1">
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
            <AvatarGroup users={presence} size="xs" max={4} />
            <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
              {pluralize(presence.length, 'member')} online
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm transition-colors hover:bg-accent/60',
      )}
    >
      <Checkbox checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
