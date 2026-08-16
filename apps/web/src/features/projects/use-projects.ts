'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BoardSnapshot,
  CreateBoardInput,
  CreateProjectInput,
  ProjectDetail,
  ProjectSummary,
  UpdateProjectInput,
} from '@flowsync/shared';
import { api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface ProjectFilters {
  status?: string | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
}

export function useProjects(workspaceId: string, filters: ProjectFilters = {}) {
  return useQuery({
    queryKey: queryKeys.projects(workspaceId, filters as Record<string, unknown>),
    queryFn: () =>
      api.get<ProjectSummary[]>(
        `/workspaces/${workspaceId}/projects${toQuery({
          status: filters.status ?? null,
          search: filters.search ?? null,
          includeArchived: filters.includeArchived ?? null,
        })}`,
      ),
    enabled: Boolean(workspaceId),
  });
}

export function useProject(workspaceId: string, projectId: string) {
  return useQuery({
    queryKey: queryKeys.project(workspaceId, projectId),
    queryFn: () => api.get<ProjectDetail>(`/workspaces/${workspaceId}/projects/${projectId}`),
    enabled: Boolean(workspaceId && projectId),
  });
}

export function useCreateProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api.post<ProjectSummary>(`/workspaces/${workspaceId}/projects`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'projects'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
    },
  });
}

export function useUpdateProject(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectInput) =>
      api.patch<ProjectSummary>(`/workspaces/${workspaceId}/projects/${projectId}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'projects'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceId, projectId) });
    },
  });
}

export function useDeleteProject(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/projects/${projectId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'projects'] }),
  });
}

export function useProjectMembers(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: (userIds: string[]) =>
      api.post<ProjectDetail>(`/workspaces/${workspaceId}/projects/${projectId}/members`, { userIds }),
    onSuccess: (project) =>
      queryClient.setQueryData(queryKeys.project(workspaceId, projectId), project),
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      api.delete<ProjectDetail>(
        `/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`,
      ),
    onSuccess: (project) =>
      queryClient.setQueryData(queryKeys.project(workspaceId, projectId), project),
  });

  return { add, remove };
}

export function useBoard(workspaceId: string, boardId: string) {
  return useQuery({
    queryKey: queryKeys.board(workspaceId, boardId),
    queryFn: () => api.get<BoardSnapshot>(`/workspaces/${workspaceId}/boards/${boardId}`),
    enabled: Boolean(workspaceId && boardId),
  });
}

export function useCreateBoard(workspaceId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) =>
      api.post(`/workspaces/${workspaceId}/projects/${projectId}/boards`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.project(workspaceId, projectId) }),
  });
}
