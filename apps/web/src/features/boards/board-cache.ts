import {
  firstRank,
  rankBetween,
  sortByRank,
  type BoardColumnView,
  type BoardSnapshot,
  type TaskSummary,
} from '@flowsync/shared';

/**
 * Pure reducers over a board snapshot.
 *
 * Realtime events and optimistic mutations both funnel through these, which is
 * what lets a burst of twenty events cost twenty in-memory updates and zero
 * network requests. Being pure also makes them straightforward to unit test —
 * the ordering and de-duplication rules live here rather than in a component.
 */

export function upsertTask(snapshot: BoardSnapshot, task: TaskSummary): BoardSnapshot {
  const existing = snapshot.tasks.findIndex((candidate) => candidate.id === task.id);

  const tasks =
    existing === -1
      ? [...snapshot.tasks, task]
      : snapshot.tasks.map((candidate) => (candidate.id === task.id ? task : candidate));

  return { ...snapshot, tasks: sortByRank(tasks) };
}

export function removeTask(snapshot: BoardSnapshot, taskId: string): BoardSnapshot {
  return { ...snapshot, tasks: snapshot.tasks.filter((task) => task.id !== taskId) };
}

export function upsertColumn(snapshot: BoardSnapshot, column: BoardColumnView): BoardSnapshot {
  const existing = snapshot.columns.findIndex((candidate) => candidate.id === column.id);

  const columns =
    existing === -1
      ? [...snapshot.columns, column]
      : snapshot.columns.map((candidate) => (candidate.id === column.id ? column : candidate));

  return { ...snapshot, columns: sortByRank(columns) };
}

export function removeColumn(
  snapshot: BoardSnapshot,
  columnId: string,
  movedTasksToColumnId: string | null,
): BoardSnapshot {
  const columns = snapshot.columns.filter((column) => column.id !== columnId);

  // Tasks either follow the relocation the server performed, or disappear with
  // the column. Either way the board must not keep cards pointing at nothing.
  const tasks = movedTasksToColumnId
    ? snapshot.tasks.map((task) =>
        task.columnId === columnId ? { ...task, columnId: movedTasksToColumnId } : task,
      )
    : snapshot.tasks.filter((task) => task.columnId !== columnId);

  return { ...snapshot, columns, tasks };
}

/** Tasks belonging to a column, in rank order. */
export function tasksInColumn(snapshot: BoardSnapshot, columnId: string): TaskSummary[] {
  return sortByRank(snapshot.tasks.filter((task) => task.columnId === columnId));
}

export interface DropTarget {
  columnId: string;
  /** Index the card should occupy in the destination column after the move. */
  index: number;
}

export interface MoveNeighbours {
  beforeTaskId: string | null;
  afterTaskId: string | null;
}

/**
 * Translates a drop into the neighbour pair the API expects.
 *
 * The client never invents a rank — it names the cards the dropped card landed
 * between and lets the server compute the position transactionally, which is what
 * makes two people dropping onto the same slot safe.
 */
export function neighboursForDrop(
  snapshot: BoardSnapshot,
  taskId: string,
  target: DropTarget,
): MoveNeighbours {
  const columnTasks = tasksInColumn(snapshot, target.columnId).filter((task) => task.id !== taskId);

  const before = target.index > 0 ? columnTasks[target.index - 1] : undefined;
  const after = columnTasks[target.index];

  return {
    beforeTaskId: before?.id ?? null,
    afterTaskId: after?.id ?? null,
  };
}

/**
 * Applies a move locally so the card lands under the cursor immediately.
 *
 * The rank is a placeholder derived from the neighbours purely for ordering the
 * optimistic render; the server's authoritative rank replaces it when the
 * response (or the realtime event) arrives.
 */
export function applyOptimisticMove(
  snapshot: BoardSnapshot,
  taskId: string,
  target: DropTarget,
): BoardSnapshot {
  const task = snapshot.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return snapshot;

  const columnTasks = tasksInColumn(snapshot, target.columnId).filter(
    (candidate) => candidate.id !== taskId,
  );

  const before = target.index > 0 ? columnTasks[target.index - 1] : undefined;
  const after = columnTasks[target.index];

  const provisionalRank = interpolateRank(before?.rank, after?.rank);
  const destinationColumn = snapshot.columns.find((column) => column.id === target.columnId);

  const moved: TaskSummary = {
    ...task,
    columnId: target.columnId,
    rank: provisionalRank,
    isDone: destinationColumn?.isDone ?? task.isDone,
  };

  return upsertTask(snapshot, moved);
}

/**
 * A provisional ordering key between two ranks.
 *
 * This runs the same fractional-ranking algorithm the server uses, so the
 * optimistic order is identical to the order that comes back — the card does not
 * visibly jump when the response lands. If the neighbours are somehow not a valid
 * range (a stale cache mid-resync), fall back to the neighbour's own rank rather
 * than throwing during a drag.
 */
function interpolateRank(before: string | undefined, after: string | undefined): string {
  try {
    return rankBetween(before ?? '', after ?? '');
  } catch {
    return before ?? after ?? firstRank();
  }
}
