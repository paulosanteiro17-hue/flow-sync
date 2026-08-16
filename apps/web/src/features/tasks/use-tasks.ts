'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BoardSnapshot,
  CreateSubtaskInput,
  CreateTaskInput,
  MyTasksQuery,
  SubtaskView,
  TaskDetail,
  TaskSummary,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from '@flowsync/shared';
import { toast } from 'sonner';
import { ApiError, api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  applyOptimisticMove,
  neighboursForDrop,
  removeTask,
  upsertTask,
  type DropTarget,
} from '@/features/boards/board-cache';

export function useTask(workspaceId: string, taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.task(workspaceId, taskId ?? ''),
    queryFn: () => api.get<TaskDetail>(`/workspaces/${workspaceId}/tasks/${taskId}`),
    enabled: Boolean(workspaceId && taskId),
  });
}

export function useMyTasks(workspaceId: string, query: Partial<MyTasksQuery>) {
  return useQuery({
    queryKey: queryKeys.myTasks(workspaceId, query as Record<string, unknown>),
    queryFn: () =>
      api.get<TaskSummary[]>(
        `/workspaces/${workspaceId}/my-tasks${toQuery({
          bucket: query.bucket ?? null,
          search: query.search ?? null,
          priority: query.priority ?? null,
          projectId: query.projectId ?? null,
          sort: query.sort ?? null,
        })}`,
      ),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateTask(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      api.post<TaskSummary>(`/workspaces/${workspaceId}/tasks`, input),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(queryKeys.board(workspaceId, boardId), (snapshot) =>
        snapshot ? upsertTask(snapshot, task) : snapshot,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
    },
    onError: (error) => toast.error(messageFor(error, 'The task could not be created.')),
  });
}

export function useUpdateTask(workspaceId: string, boardId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: UpdateTaskInput }) =>
      api.patch<TaskSummary>(`/workspaces/${workspaceId}/tasks/${taskId}`, input),
    onSuccess: (task) => {
      if (boardId) {
        queryClient.setQueryData<BoardSnapshot>(queryKeys.board(workspaceId, boardId), (snapshot) =>
          snapshot ? upsertTask(snapshot, task) : snapshot,
        );
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.task(workspaceId, task.id) });
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'my-tasks'] });
    },
    onError: (error) => toast.error(messageFor(error, 'The change could not be saved.')),
  });
}

export function useDeleteTask(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => api.delete<void>(`/workspaces/${workspaceId}/tasks/${taskId}`),
    onSuccess: (_result, taskId) => {
      queryClient.setQueryData<BoardSnapshot>(queryKeys.board(workspaceId, boardId), (snapshot) =>
        snapshot ? removeTask(snapshot, taskId) : snapshot,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
    },
    onError: (error) => toast.error(messageFor(error, 'The task could not be deleted.')),
  });
}

/**
 * Moving a card is the one interaction that must feel instant, so it is applied
 * to the cache before the request leaves. If the server rejects it — a lost race,
 * a permission change, a dropped connection — the previous snapshot is restored
 * and the user is told, rather than the board silently lying.
 */
export function useMoveTask(workspaceId: string, boardId: string) {
  const queryClient = useQueryClient();
  const boardKey = queryKeys.board(workspaceId, boardId);

  return useMutation({
    mutationFn: async ({ taskId, target }: { taskId: string; target: DropTarget }) => {
      const snapshot = queryClient.getQueryData<BoardSnapshot>(boardKey);
      if (!snapshot) throw new Error('Board is not loaded');

      const neighbours = neighboursForDrop(snapshot, taskId, target);
      return api.patch<TaskSummary>(`/workspaces/${workspaceId}/tasks/${taskId}/move`, {
        columnId: target.columnId,
        ...neighbours,
      });
    },

    onMutate: async ({ taskId, target }) => {
      await queryClient.cancelQueries({ queryKey: boardKey });
      const previous = queryClient.getQueryData<BoardSnapshot>(boardKey);

      if (previous) {
        queryClient.setQueryData<BoardSnapshot>(boardKey, applyOptimisticMove(previous, taskId, target));
      }

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(boardKey, context.previous);
      toast.error(messageFor(error, 'The card could not be moved.'), {
        description: 'The board has been restored to its last known state.',
      });
    },

    onSuccess: (task) => {
      // Replace the provisional rank with the server's authoritative one.
      queryClient.setQueryData<BoardSnapshot>(boardKey, (snapshot) =>
        snapshot ? upsertTask(snapshot, task) : snapshot,
      );
    },
  });
}

export function useSubtasks(workspaceId: string, taskId: string, boardId: string | null) {
  const queryClient = useQueryClient();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.task(workspaceId, taskId) });
    if (boardId) void queryClient.invalidateQueries({ queryKey: queryKeys.board(workspaceId, boardId) });
  };

  const create = useMutation({
    mutationFn: (input: CreateSubtaskInput) =>
      api.post<SubtaskView>(`/workspaces/${workspaceId}/tasks/${taskId}/subtasks`, input),
    onSuccess: refresh,
    onError: (error) => toast.error(messageFor(error, 'The subtask could not be added.')),
  });

  const update = useMutation({
    mutationFn: ({ subtaskId, input }: { subtaskId: string; input: UpdateSubtaskInput }) =>
      api.patch<SubtaskView>(`/workspaces/${workspaceId}/subtasks/${subtaskId}`, input),
    onSuccess: refresh,
    onError: (error) => toast.error(messageFor(error, 'The subtask could not be updated.')),
  });

  const remove = useMutation({
    mutationFn: (subtaskId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/subtasks/${subtaskId}`),
    onSuccess: refresh,
    onError: (error) => toast.error(messageFor(error, 'The subtask could not be removed.')),
  });

  return { create, update, remove };
}

function messageFor(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.isForbidden) return 'Your role does not allow that.';
    if (error.isNotFound) return 'That item no longer exists.';
    return error.message;
  }
  return fallback;
}
