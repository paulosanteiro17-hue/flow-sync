/**
 * Domain vocabulary shared by the API and the web app.
 * These string unions mirror the Prisma enums one-for-one.
 */

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Higher number = more authority. Used for "cannot act on someone above you" checks. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  GUEST: 1,
};

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  OWNER: 'Full control, including billing, ownership transfer and workspace deletion.',
  ADMIN: 'Manages projects, boards and people. Cannot delete the workspace.',
  MEMBER: 'Works on projects: creates, edits and moves tasks, comments and uploads.',
  GUEST: 'Read-only access to assigned projects, with the ability to comment.',
};

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const TASK_PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'No Priority',
};

/** Sort weight for "most urgent first" ordering. */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'MENTION',
  'COMMENT',
  'DUE_SOON',
  'STATUS_CHANGE',
  'INVITATION',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ACTIVITY_TYPES = [
  'PROJECT_CREATED',
  'PROJECT_UPDATED',
  'PROJECT_ARCHIVED',
  'BOARD_CREATED',
  'BOARD_UPDATED',
  'COLUMN_CREATED',
  'COLUMN_UPDATED',
  'COLUMN_DELETED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_MOVED',
  'TASK_DELETED',
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
  'TASK_PRIORITY_CHANGED',
  'TASK_DUE_DATE_CHANGED',
  'TASK_LABEL_ADDED',
  'TASK_LABEL_REMOVED',
  'SUBTASK_CREATED',
  'SUBTASK_COMPLETED',
  'COMMENT_CREATED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
  'MEMBER_JOINED',
  'MEMBER_ROLE_CHANGED',
  'MEMBER_REMOVED',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The label palette offered to every new workspace. */
export const DEFAULT_LABELS = [
  { name: 'Bug', color: '#ef4444' },
  { name: 'Feature', color: '#6366f1' },
  { name: 'Frontend', color: '#0ea5e9' },
  { name: 'Backend', color: '#10b981' },
  { name: 'Design', color: '#ec4899' },
  { name: 'Security', color: '#f97316' },
  { name: 'Performance', color: '#eab308' },
  { name: 'Documentation', color: '#8b5cf6' },
] as const;

/** Columns created with every new board. */
export const DEFAULT_COLUMNS = [
  { name: 'Backlog', color: '#94a3b8' },
  { name: 'To Do', color: '#64748b' },
  { name: 'In Progress', color: '#3b82f6' },
  { name: 'Review', color: '#a855f7' },
  { name: 'Done', color: '#22c55e' },
] as const;

export const PROJECT_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
] as const;

/** Hard limits mirrored by validation on both sides of the wire. */
export const LIMITS = {
  nameMin: 1,
  workspaceNameMax: 60,
  projectNameMax: 80,
  projectPrefixMin: 2,
  projectPrefixMax: 6,
  boardNameMax: 60,
  columnNameMax: 40,
  taskTitleMax: 200,
  taskDescriptionMax: 20_000,
  commentBodyMax: 5_000,
  subtaskTitleMax: 200,
  labelNameMax: 24,
  passwordMin: 10,
  passwordMax: 128,
  searchQueryMax: 120,
  pageSizeDefault: 25,
  pageSizeMax: 100,
  maxAssigneesPerTask: 10,
  maxLabelsPerTask: 10,
  maxAttachmentBytes: 10 * 1024 * 1024,
} as const;

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.txt',
  '.csv',
  '.md',
  '.json',
  '.zip',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
] as const;

export const COOKIE_NAMES = {
  accessToken: 'fs_at',
  refreshToken: 'fs_rt',
  csrf: 'fs_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';
export const SOCKET_ID_HEADER = 'x-socket-id';
