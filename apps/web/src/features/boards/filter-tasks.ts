import type { TaskSummary } from '@flowsync/shared';
import { endOfDay, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import type { BoardFilters } from '@/stores/ui-store';

/**
 * Board filtering happens on the client because the whole board is already in
 * memory: filtering here is instant and keeps a filtered board reacting to
 * realtime events exactly like an unfiltered one. Filters combine with AND across
 * dimensions and OR within a dimension, which is what people expect.
 */
export function filterTasks(
  tasks: TaskSummary[],
  filters: BoardFilters,
  now = new Date(),
): TaskSummary[] {
  const search = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (search) {
      const haystack = `${task.key} ${task.title}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
      return false;
    }

    if (filters.assigneeIds.length > 0) {
      const assigned = task.assignees.some((assignee) => filters.assigneeIds.includes(assignee.id));
      if (!assigned) return false;
    }

    if (filters.labelIds.length > 0) {
      const labelled = task.labels.some((label) => filters.labelIds.includes(label.id));
      if (!labelled) return false;
    }

    if (filters.due !== 'any') {
      if (filters.due === 'none') return task.dueDate === null;
      if (!task.dueDate) return false;

      const due = parseISO(task.dueDate);
      if (filters.due === 'overdue') return isBefore(due, startOfDay(now));
      if (filters.due === 'today') {
        return !isBefore(due, startOfDay(now)) && !isAfter(due, endOfDay(now));
      }
      if (filters.due === 'week') {
        const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return !isBefore(due, startOfDay(now)) && !isAfter(due, endOfDay(weekOut));
      }
    }

    return true;
  });
}
