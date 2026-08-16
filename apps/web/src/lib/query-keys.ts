/**
 * Centralised query keys. Realtime handlers patch the cache by key, so having a
 * single vocabulary here is what keeps "an event arrived" and "a screen is showing
 * this data" talking about the same thing.
 */
export const queryKeys = {
  me: ['me'] as const,

  workspaces: ['workspaces'] as const,
  workspace: (workspaceId: string) => ['workspace', workspaceId] as const,
  members: (workspaceId: string) => ['workspace', workspaceId, 'members'] as const,
  invitations: (workspaceId: string) => ['workspace', workspaceId, 'invitations'] as const,
  labels: (workspaceId: string) => ['workspace', workspaceId, 'labels'] as const,

  dashboard: (workspaceId: string) => ['workspace', workspaceId, 'dashboard'] as const,

  projects: (workspaceId: string, filters?: Record<string, unknown>) =>
    ['workspace', workspaceId, 'projects', filters ?? {}] as const,
  project: (workspaceId: string, projectId: string) =>
    ['workspace', workspaceId, 'project', projectId] as const,

  board: (workspaceId: string, boardId: string) =>
    ['workspace', workspaceId, 'board', boardId] as const,

  task: (workspaceId: string, taskId: string) =>
    ['workspace', workspaceId, 'task', taskId] as const,
  myTasks: (workspaceId: string, filters?: Record<string, unknown>) =>
    ['workspace', workspaceId, 'my-tasks', filters ?? {}] as const,

  comments: (workspaceId: string, taskId: string) =>
    ['workspace', workspaceId, 'task', taskId, 'comments'] as const,
  attachments: (workspaceId: string, taskId: string) =>
    ['workspace', workspaceId, 'task', taskId, 'attachments'] as const,

  activity: (workspaceId: string, filters?: Record<string, unknown>) =>
    ['workspace', workspaceId, 'activity', filters ?? {}] as const,

  notifications: (workspaceId: string, filters?: Record<string, unknown>) =>
    ['workspace', workspaceId, 'notifications', filters ?? {}] as const,

  search: (workspaceId: string, term: string) =>
    ['workspace', workspaceId, 'search', term] as const,
} as const;
