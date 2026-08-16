'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  CurrentUser,
  SignInInput,
  SignUpInput,
  UpdatePreferencesInput,
  UpdateProfileInput,
} from '@flowsync/shared';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { realtimeClient } from '@/lib/realtime-client';

export function useCurrentUser(): UseQueryResult<CurrentUser | null> {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api.get<CurrentUser>('/auth/me');
      } catch (error) {
        // Not being signed in is a normal state, not a failure to report.
        if (error instanceof ApiError && error.isUnauthenticated) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) => api.post<CurrentUser>('/auth/sign-in', input),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SignUpInput) => api.post<CurrentUser>('/auth/sign-up', input),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

/** One-click entry into the seeded demo workspace. */
export function useDemoSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CurrentUser>('/auth/demo'),
    onSuccess: (user) => {
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post<void>('/auth/sign-out'),
    onSuccess: () => {
      realtimeClient.disconnect();
      // Clear every cached tenant-scoped response before leaving the app.
      queryClient.clear();
      router.push('/sign-in');
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<CurrentUser>('/users/me', input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      api.patch<CurrentUser>('/users/me/preferences', input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  });
}
