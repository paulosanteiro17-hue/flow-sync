'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedInvitation,
  CreateInvitationInput,
  CreateWorkspaceInput,
  InvitationView,
  LabelView,
  UpdateWorkspaceInput,
  WorkspaceMemberView,
  WorkspaceRole,
  WorkspaceSummary,
} from '@flowsync/shared';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => api.get<WorkspaceSummary[]>('/workspaces'),
  });
}

export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.workspace(workspaceId),
    queryFn: () => api.get<WorkspaceSummary>(`/workspaces/${workspaceId}`),
    enabled: Boolean(workspaceId),
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => api.post<WorkspaceSummary>('/workspaces', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaces }),
  });
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) =>
      api.patch<WorkspaceSummary>(`/workspaces/${workspaceId}`, input),
    onSuccess: (workspace) => {
      queryClient.setQueryData(queryKeys.workspace(workspaceId), workspace);
      void queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
    },
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.delete<void>(`/workspaces/${workspaceId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaces }),
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => api.get<WorkspaceMemberView[]>(`/workspaces/${workspaceId}/members`),
    enabled: Boolean(workspaceId),
  });
}

export function useUpdateMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      api.patch<WorkspaceMemberView[]>(`/workspaces/${workspaceId}/members/${userId}`, { role }),
    onSuccess: (members) => queryClient.setQueryData(queryKeys.members(workspaceId), members),
  });
}

export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/members/${userId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
  });
}

export function useInvitations(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invitations(workspaceId),
    queryFn: () => api.get<InvitationView[]>(`/workspaces/${workspaceId}/invitations`),
    enabled: enabled && Boolean(workspaceId),
  });
}

export function useInviteMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // The response carries `acceptUrl`, which exists nowhere else — the server
    // stores only a hash of the token — so the caller must surface it immediately.
    mutationFn: (input: CreateInvitationInput) =>
      api.post<CreatedInvitation>(`/workspaces/${workspaceId}/invitations`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceId) }),
  });
}

export function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/invitations/${invitationId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceId) }),
  });
}

export function useLabels(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.labels(workspaceId),
    queryFn: () => api.get<LabelView[]>(`/workspaces/${workspaceId}/labels`),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}
