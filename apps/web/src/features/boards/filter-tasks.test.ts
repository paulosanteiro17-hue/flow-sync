import type { TaskSummary } from '@flowsync/shared';
import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, type BoardFilters } from '@/stores/ui-store';
import { filterTasks } from './filter-tasks';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function task(overrides: Partial<TaskSummary> & { id: string }): TaskSummary {
  return {
    key: `TEST-${overrides.id}`,
    title: 'A task',
    priority: 'NONE',
    rank: 'V',
    columnId: 'todo',
    boardId: 'board-1',
    projectId: 'project-1',
    dueDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    estimate: null,
    storyPoints: null,
    assignees: [],
    labels: [],
    commentCount: 0,
    attachmentCount: 0,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isDone: false,
    ...overrides,
  };
}

const filters = (overrides: Partial<BoardFilters>): BoardFilters => ({
  ...EMPTY_FILTERS,
  ...overrides,
});

const TASKS: TaskSummary[] = [
  task({
    id: '1',
    key: 'WEB-1',
    title: 'Rebuild the pricing page',
    priority: 'HIGH',
    assignees: [{ id: 'emma', name: 'Emma Carter', avatarUrl: null }],
    labels: [{ id: 'frontend', name: 'Frontend', color: '#0ea5e9' }],
    dueDate: '2026-06-14T17:00:00.000Z', // yesterday
  }),
  task({
    id: '2',
    key: 'WEB-2',
    title: 'Fix the carousel layout shift',
    priority: 'URGENT',
    assignees: [{ id: 'olivia', name: 'Olivia Chen', avatarUrl: null }],
    labels: [{ id: 'bug', name: 'Bug', color: '#ef4444' }],
    dueDate: '2026-06-15T17:00:00.000Z', // today
  }),
  task({
    id: '3',
    key: 'WEB-3',
    title: 'Write the launch post',
    priority: 'LOW',
    dueDate: '2026-06-19T17:00:00.000Z', // within the week
  }),
  task({ id: '4', key: 'WEB-4', title: 'Retire the legacy bundle', priority: 'MEDIUM' }),
];

describe('filterTasks', () => {
  it('returns everything when nothing is filtered', () => {
    expect(filterTasks(TASKS, EMPTY_FILTERS, NOW)).toHaveLength(4);
  });

  it('matches on title and key, case-insensitively', () => {
    expect(filterTasks(TASKS, filters({ search: 'CAROUSEL' }), NOW).map((t) => t.id)).toEqual([
      '2',
    ]);
    expect(filterTasks(TASKS, filters({ search: 'web-3' }), NOW).map((t) => t.id)).toEqual(['3']);
  });

  it('ORs within the priority dimension', () => {
    const result = filterTasks(TASKS, filters({ priorities: ['URGENT', 'LOW'] }), NOW);
    expect(result.map((t) => t.id)).toEqual(['2', '3']);
  });

  it('filters by assignee', () => {
    expect(filterTasks(TASKS, filters({ assigneeIds: ['emma'] }), NOW).map((t) => t.id)).toEqual([
      '1',
    ]);
  });

  it('filters by label', () => {
    expect(filterTasks(TASKS, filters({ labelIds: ['bug'] }), NOW).map((t) => t.id)).toEqual(['2']);
  });

  it('understands the due-date buckets', () => {
    expect(filterTasks(TASKS, filters({ due: 'overdue' }), NOW).map((t) => t.id)).toEqual(['1']);
    expect(filterTasks(TASKS, filters({ due: 'today' }), NOW).map((t) => t.id)).toEqual(['2']);
    expect(filterTasks(TASKS, filters({ due: 'week' }), NOW).map((t) => t.id)).toEqual(['2', '3']);
    expect(filterTasks(TASKS, filters({ due: 'none' }), NOW).map((t) => t.id)).toEqual(['4']);
  });

  it('ANDs across dimensions', () => {
    const result = filterTasks(
      TASKS,
      filters({ priorities: ['URGENT'], labelIds: ['frontend'] }),
      NOW,
    );
    expect(result).toEqual([]);
  });

  it('combines search with another dimension', () => {
    const result = filterTasks(TASKS, filters({ search: 'the', priorities: ['LOW'] }), NOW);
    expect(result.map((t) => t.id)).toEqual(['3']);
  });
});
