'use client';

import type { BoardColumnView } from '@flowsync/shared';
import { KanbanSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/topbar';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { BoardToolbar } from '@/features/boards/board-toolbar';
import { BoardView } from '@/features/boards/board-view';
import {
  ColumnDialog,
  CreateTaskDialog,
  DeleteColumnDialog,
} from '@/features/boards/board-dialogs';
import { filterTasks } from '@/features/boards/filter-tasks';
import { useBoard } from '@/features/projects/use-projects';
import {
  usePresence,
  useRealtime,
  useRoomSubscription,
} from '@/features/realtime/realtime-provider';
import { TaskDrawer } from '@/features/tasks/task-drawer';
import { useLabels, useMembers, useWorkspace } from '@/features/workspaces/use-workspaces';
import { useUiStore } from '@/stores/ui-store';

function BoardPageInner() {
  const params = useParams<{ workspaceId: string; boardId: string }>();
  const { workspaceId, boardId } = params;

  const router = useRouter();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get('task');

  const { data: workspace } = useWorkspace(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const { data: labels = [] } = useLabels(workspaceId);
  const { data: snapshot, isLoading, isError, refetch } = useBoard(workspaceId, boardId);

  const { adoptSequence } = useRealtime();
  const presence = usePresence('board', boardId);
  const filters = useUiStore((state) => state.boardFilters);
  const resetFilters = useUiStore((state) => state.resetBoardFilters);

  const [createInColumn, setCreateInColumn] = useState<string | null>(null);
  const [columnDialog, setColumnDialog] = useState<BoardColumnView | 'new' | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<BoardColumnView | null>(null);

  // Join the board room for the lifetime of this page.
  useRoomSubscription('board', boardId);

  // Line the realtime stream up with the snapshot we just rendered, so the next
  // event is recognised as the next one rather than as a gap.
  useEffect(() => {
    if (snapshot) adoptSequence('board', boardId, snapshot.seq);
  }, [snapshot, boardId, adoptSequence]);

  // Filters are per-board; carrying them between boards would be surprising.
  useEffect(() => {
    resetFilters();
  }, [boardId, resetFilters]);

  const openTask = (taskId: string) => {
    router.replace(`/app/${workspaceId}/boards/${boardId}?task=${taskId}`, { scroll: false });
  };

  const closeTask = () => {
    router.replace(`/app/${workspaceId}/boards/${boardId}`, { scroll: false });
  };

  const visibleCount = snapshot ? filterTasks(snapshot.tasks, filters).length : 0;

  return (
    <>
      <Topbar workspaceId={workspaceId}>
        {snapshot ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/app/${workspaceId}/projects/${snapshot.project.id}`}
                className="truncate text-sm font-semibold hover:underline"
              >
                {snapshot.project.name}
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="truncate text-sm text-muted-foreground">{snapshot.board.name}</span>
            </div>
          </div>
        ) : (
          <Skeleton className="h-4 w-40" />
        )}
      </Topbar>

      {isError ? (
        <div className="p-6">
          <ErrorState
            title="This board could not be loaded"
            message="It may have been deleted, or you may no longer have access to it."
            onRetry={() => void refetch()}
          />
        </div>
      ) : isLoading || !snapshot ? (
        <BoardSkeleton />
      ) : (
        <>
          <BoardToolbar
            members={members}
            labels={labels}
            presence={presence}
            taskCount={snapshot.tasks.length}
            visibleCount={visibleCount}
          />

          {snapshot.columns.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<KanbanSquare />}
                title="This board has no columns yet"
                description="Add a column to start tracking work."
              />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden pt-3">
              <BoardView
                workspaceId={workspaceId}
                snapshot={snapshot}
                role={workspace?.role}
                onOpenTask={openTask}
                onAddTask={setCreateInColumn}
                onAddColumn={() => setColumnDialog('new')}
                onEditColumn={setColumnDialog}
                onDeleteColumn={setColumnToDelete}
              />
            </div>
          )}
        </>
      )}

      <CreateTaskDialog
        workspaceId={workspaceId}
        boardId={boardId}
        columnId={createInColumn}
        members={members}
        labels={labels}
        onOpenChange={(open) => !open && setCreateInColumn(null)}
      />

      <ColumnDialog
        workspaceId={workspaceId}
        boardId={boardId}
        target={columnDialog}
        onOpenChange={(open) => !open && setColumnDialog(null)}
      />

      <DeleteColumnDialog
        workspaceId={workspaceId}
        boardId={boardId}
        column={columnToDelete}
        snapshot={snapshot}
        onOpenChange={(open) => !open && setColumnToDelete(null)}
      />

      <TaskDrawer
        workspaceId={workspaceId}
        boardId={boardId}
        taskId={openTaskId}
        role={workspace?.role}
        members={members}
        labels={labels}
        onClose={closeTask}
      />
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden p-4">
      {[0, 1, 2, 3].map((column) => (
        <div key={column} className="w-[300px] shrink-0 space-y-2">
          <Skeleton className="h-4 w-24" />
          <div className="space-y-2 rounded-xl bg-surface p-2">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardPageInner />
    </Suspense>
  );
}
