import { DndContext } from '@dnd-kit/core';
import type { TaskSummary } from '@flowsync/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskCard } from './task-card';

function task(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'task-1',
    key: 'WEB-101',
    title: 'Rebuild the pricing page layout',
    priority: 'HIGH',
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

/** dnd-kit's `useSortable` needs a DndContext ancestor. */
function renderCard(props: Partial<Parameters<typeof TaskCard>[0]> = {}) {
  const onOpen = vi.fn();
  render(
    <DndContext>
      <TaskCard task={task()} onOpen={onOpen} {...props} />
    </DndContext>,
  );
  return { onOpen };
}

describe('TaskCard', () => {
  it('shows the readable key and title', () => {
    renderCard();
    expect(screen.getByText('WEB-101')).toBeInTheDocument();
    expect(screen.getByText('Rebuild the pricing page layout')).toBeInTheDocument();
  });

  it('exposes an accessible name that includes the priority', () => {
    renderCard();
    expect(
      screen.getByRole('button', { name: /WEB-101: Rebuild the pricing page layout\. Priority High\./ }),
    ).toBeInTheDocument();
  });

  it('opens the task when clicked', () => {
    const { onOpen } = renderCard();

    // A plain click event rather than `userEvent.click`: dnd-kit's pointer sensor
    // calls preventDefault on pointerdown, which suppresses the synthetic click
    // in jsdom. Real-browser click-to-open is covered by the Playwright suite.
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('task-1');
  });

  it('opens the task from the keyboard', async () => {
    const user = userEvent.setup();
    const { onOpen } = renderCard();

    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('task-1');
  });

  it('renders subtask progress only when there are subtasks', () => {
    const { onOpen } = renderCard({
      task: task({ subtaskCount: 5, completedSubtaskCount: 3 }),
    });
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByText('3/5')).toBeInTheDocument();
  });

  it('flags an overdue due date', () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    renderCard({ task: task({ dueDate: yesterday }) });
    expect(screen.getByText(/overdue|Yesterday/)).toBeInTheDocument();
  });

  it('shows labels and comment counts', () => {
    renderCard({
      task: task({
        labels: [{ id: 'bug', name: 'Bug', color: '#ef4444' }],
        commentCount: 4,
      }),
    });
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
