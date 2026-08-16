'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachmentView, CommentView, CursorPage } from '@flowsync/shared';
import { toast } from 'sonner';
import { api, toQuery } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useComments(workspaceId: string, taskId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.comments(workspaceId, taskId ?? ''),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<CursorPage<CommentView>>(
        `/workspaces/${workspaceId}/tasks/${taskId}/comments${toQuery({
          cursor: pageParam ?? null,
          limit: 20,
        })}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(workspaceId && taskId),
  });
}

export function useCommentMutations(workspaceId: string, taskId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.comments(workspaceId, taskId) });

  const create = useMutation({
    mutationFn: (body: string) =>
      api.post<CommentView>(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, {
        body,
        mentionedUserIds: [],
      }),
    onSuccess: invalidate,
    onError: () => toast.error('Your comment could not be posted.'),
  });

  const update = useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      api.patch<CommentView>(`/workspaces/${workspaceId}/comments/${commentId}`, { body }),
    onSuccess: invalidate,
    onError: () => toast.error('The edit could not be saved.'),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/comments/${commentId}`),
    onSuccess: invalidate,
    onError: () => toast.error('The comment could not be deleted.'),
  });

  return { create, update, remove };
}

export function useAttachments(workspaceId: string, taskId: string | null) {
  return useQuery({
    queryKey: queryKeys.attachments(workspaceId, taskId ?? ''),
    queryFn: () =>
      api.get<AttachmentView[]>(`/workspaces/${workspaceId}/tasks/${taskId}/attachments`),
    enabled: Boolean(workspaceId && taskId),
  });
}

export function useAttachmentMutations(workspaceId: string, taskId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.attachments(workspaceId, taskId) });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<AttachmentView>(
        `/workspaces/${workspaceId}/tasks/${taskId}/attachments`,
        formData,
      );
    },
    onSuccess: invalidate,
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : 'The file could not be uploaded.'),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete<void>(`/workspaces/${workspaceId}/attachments/${attachmentId}`),
    onSuccess: invalidate,
    onError: () => toast.error('The attachment could not be removed.'),
  });

  return { upload, remove };
}
