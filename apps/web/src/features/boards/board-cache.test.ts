import type { BoardColumnView, BoardSnapshot, TaskSummary } from '@flowsync/shared';
import { describe, expect, it } from 'vitest';
import {
  applyOptimisticMove,
  neighboursForDrop,
  removeColumn,
  removeTask,
  tasksInColumn,
  upsertColumn,
  upsertTask,
} from './board-cache';

function column(id: string, rank: string, overrides: Partial<BoardColumnView> = {}): BoardColumnView {
  return {
    id,
    name: id,
    color: '#64748b',
    rank,
    boardId: 'board-1',
    wipLimit: null,
    isDone: false,
    ...overrides,
  };
}

function task(id: string, columnId: string, rank: string): TaskSummary {
  return {
    id,
    key: `TEST-${id}`,
    title: `Task ${id}`,
    priority: 'NONE',
    rank,
    columnId,
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
  };
}

function snapshot(): BoardSnapshot {
  return {
    board: {
      id: 'board-1',
      name: 'Main Board',
      projectId: 'project-1',
      isDefault: true,
      rank: 'V',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    project: {
      id: 'project-1',
      name: 'Test Project',
      key: 'TEST',
      description: null,
      status: 'ACTIVE',
      color: '#6366f1',
      icon: 'Layers',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lead: null,
      memberCount: 1,
      taskCount: 3,
      completedTaskCount: 0,
    },
    columns: [column('todo', 'V'), column('doing', 'k'), column('done', 'z', { isDone: true })],
    tasks: [task('a', 'todo', 'V'), task('b', 'todo', 'k'), task('c', 'doing', 'V')],
    seq: 12,
  };
}

describe('upsertTask', () => {
  it('adds a task and keeps the board in rank order', () => {
    const result = upsertTask(snapshot(), task('d', 'todo', 'B'));
    expect(result.tasks.map((entry) => entry.id)).toEqual(['d', 'a', 'c', 'b']);
  });

  it('replaces an existing task rather than duplicating it', () => {
    const moved = { ...task('a', 'doing', 'z'), title: 'Renamed' };
    const result = upsertTask(snapshot(), moved);

    expect(result.tasks.filter((entry) => entry.id === 'a')).toHaveLength(1);
    expect(result.tasks.find((entry) => entry.id === 'a')?.title).toBe('Renamed');
    expect(result.tasks.find((entry) => entry.id === 'a')?.columnId).toBe('doing');
  });

  it('does not mutate the snapshot it was given', () => {
    const original = snapshot();
    upsertTask(original, task('d', 'todo', 'B'));
    expect(original.tasks).toHaveLength(3);
  });
});

describe('removeTask', () => {
  it('drops the task and leaves the rest alone', () => {
    const result = removeTask(snapshot(), 'a');
    expect(result.tasks.map((entry) => entry.id)).toEqual(['b', 'c']);
  });

  it('is a no-op for an unknown id', () => {
    expect(removeTask(snapshot(), 'nope').tasks).toHaveLength(3);
  });
});

describe('columns', () => {
  it('inserts a column in rank order', () => {
    const result = upsertColumn(snapshot(), column('review', 'p'));
    expect(result.columns.map((entry) => entry.id)).toEqual(['todo', 'doing', 'review', 'done']);
  });

  it('relocates tasks when the server moved them', () => {
    const result = removeColumn(snapshot(), 'todo', 'doing');
    expect(result.columns.map((entry) => entry.id)).toEqual(['doing', 'done']);
    expect(result.tasks.every((entry) => entry.columnId === 'doing')).toBe(true);
  });

  it('drops tasks when the column was deleted with them', () => {
    const result = removeColumn(snapshot(), 'todo', null);
    expect(result.tasks.map((entry) => entry.id)).toEqual(['c']);
  });
});

describe('neighboursForDrop', () => {
  it('names both neighbours for a drop in the middle', () => {
    const board = upsertTask(snapshot(), task('d', 'todo', 'm'));
    // todo now holds a (V), b (k), d (m) in rank order.
    const neighbours = neighboursForDrop(board, 'd', { columnId: 'todo', index: 1 });
    expect(neighbours).toEqual({ beforeTaskId: 'a', afterTaskId: 'b' });
  });

  it('reports no predecessor at the top of a column', () => {
    expect(neighboursForDrop(snapshot(), 'c', { columnId: 'todo', index: 0 })).toEqual({
      beforeTaskId: null,
      afterTaskId: 'a',
    });
  });

  it('reports no successor at the bottom of a column', () => {
    expect(neighboursForDrop(snapshot(), 'c', { columnId: 'todo', index: 2 })).toEqual({
      beforeTaskId: 'b',
      afterTaskId: null,
    });
  });

  it('excludes the moving task from its own neighbours', () => {
    // Moving `a` to the end of its own column: `b` is the only other card.
    expect(neighboursForDrop(snapshot(), 'a', { columnId: 'todo', index: 1 })).toEqual({
      beforeTaskId: 'b',
      afterTaskId: null,
    });
  });
});

describe('applyOptimisticMove', () => {
  it('moves a task across columns and orders it correctly', () => {
    const result = applyOptimisticMove(snapshot(), 'a', { columnId: 'doing', index: 0 });
    const doing = tasksInColumn(result, 'doing');

    expect(doing.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(tasksInColumn(result, 'todo').map((entry) => entry.id)).toEqual(['b']);
  });

  it('marks the task done when it lands in a completion column', () => {
    const result = applyOptimisticMove(snapshot(), 'a', { columnId: 'done', index: 0 });
    expect(result.tasks.find((entry) => entry.id === 'a')?.isDone).toBe(true);
  });

  it('clears done when it leaves a completion column', () => {
    const board = upsertTask(snapshot(), { ...task('a', 'done', 'V'), isDone: true });
    const result = applyOptimisticMove(board, 'a', { columnId: 'todo', index: 0 });
    expect(result.tasks.find((entry) => entry.id === 'a')?.isDone).toBe(false);
  });

  it('reorders within the same column without losing the card', () => {
    const result = applyOptimisticMove(snapshot(), 'b', { columnId: 'todo', index: 0 });
    expect(tasksInColumn(result, 'todo').map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('ignores a move of a task that is not on the board', () => {
    const original = snapshot();
    expect(applyOptimisticMove(original, 'ghost', { columnId: 'todo', index: 0 })).toBe(original);
  });
});
