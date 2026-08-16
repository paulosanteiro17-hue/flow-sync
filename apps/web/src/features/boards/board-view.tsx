'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { can, type BoardColumnView, type BoardSnapshot, type TaskSummary } from '@flowsync/shared';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMoveTask } from '@/features/tasks/use-tasks';
import { useUiStore } from '@/stores/ui-store';
import { filterTasks } from './filter-tasks';
import { tasksInColumn } from './board-cache';
import { BoardColumn } from './board-column';
import { TaskCard } from './task-card';

interface BoardViewProps {
  workspaceId: string;
  snapshot: BoardSnapshot;
  role: Parameters<typeof can>[0];
  onOpenTask: (taskId: string) => void;
  onAddTask: (columnId: string) => void;
  onAddColumn: () => void;
  onEditColumn: (column: BoardColumnView) => void;
  onDeleteColumn: (column: BoardColumnView) => void;
}

export function BoardView({
  workspaceId,
  snapshot,
  role,
  onOpenTask,
  onAddTask,
  onAddColumn,
  onEditColumn,
  onDeleteColumn,
}: BoardViewProps) {
  const filters = useUiStore((state) => state.boardFilters);
  const moveTask = useMoveTask(workspaceId, snapshot.board.id);
  const [draggingTask, setDraggingTask] = useState<TaskSummary | null>(null);

  const canEdit = can(role, 'task:create');
  const canManageBoard = can(role, 'board:manage');

  const sensors = useSensors(
    // A small activation distance keeps a click-to-open from being read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleTasks = useMemo(
    () => filterTasks(snapshot.tasks, filters),
    [snapshot.tasks, filters],
  );
  const filtered = visibleTasks.length !== snapshot.tasks.length;

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, TaskSummary[]>();
    for (const column of snapshot.columns) {
      map.set(column.id, tasksInColumn({ ...snapshot, tasks: visibleTasks }, column.id));
    }
    return map;
  }, [snapshot, visibleTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = snapshot.tasks.find((candidate) => candidate.id === event.active.id);
    setDraggingTask(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingTask(null);

    const { active, over } = event;
    if (!over) return;

    const activeTask = snapshot.tasks.find((task) => task.id === active.id);
    if (!activeTask) return;

    // The drop target is either a column (empty space) or another card.
    const overData = over.data.current as { type?: string; columnId?: string } | undefined;
    const overTask = snapshot.tasks.find((task) => task.id === over.id);
    const targetColumnId = overTask?.columnId ?? overData?.columnId ?? String(over.id);

    const column = snapshot.columns.find((candidate) => candidate.id === targetColumnId);
    if (!column) return;

    const columnTasks = (tasksByColumn.get(column.id) ?? []).filter(
      (task) => task.id !== activeTask.id,
    );

    const index = overTask
      ? columnTasks.findIndex((task) => task.id === overTask.id)
      : columnTasks.length;

    const targetIndex = index === -1 ? columnTasks.length : index;

    // Dropping a card back exactly where it started is not a change.
    const currentIndex = (tasksByColumn.get(activeTask.columnId) ?? []).findIndex(
      (task) => task.id === activeTask.id,
    );
    if (activeTask.columnId === column.id && currentIndex === targetIndex) return;

    moveTask.mutate({ taskId: activeTask.id, target: { columnId: column.id, index: targetIndex } });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      modifiers={[restrictToWindowEdges]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingTask(null)}
      accessibility={{
        announcements: {
          onDragStart: ({ active }) => `Picked up task ${String(active.id)}`,
          onDragOver: ({ over }) => (over ? `Moved over ${String(over.id)}` : 'No drop target'),
          onDragEnd: ({ over }) =>
            over ? `Dropped onto ${String(over.id)}` : 'Dropped outside the board',
          onDragCancel: () => 'Move cancelled, the task returned to its position',
        },
      }}
    >
      <div className="flex h-full scrollbar-thin gap-3 overflow-x-auto px-3 pb-4 sm:gap-4 sm:px-4">
        {snapshot.columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            tasks={tasksByColumn.get(column.id) ?? []}
            canEdit={canEdit}
            filtered={filtered}
            onOpenTask={onOpenTask}
            onAddTask={onAddTask}
            onRenameColumn={onEditColumn}
            onDeleteColumn={onDeleteColumn}
          />
        ))}

        {canManageBoard ? (
          <div className="w-[240px] shrink-0 pt-7">
            <Button
              variant="outline"
              className="w-full justify-start border-dashed"
              onClick={onAddColumn}
            >
              <Plus />
              Add column
            </Button>
          </div>
        ) : null}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {draggingTask ? <TaskCard task={draggingTask} onOpen={() => undefined} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
