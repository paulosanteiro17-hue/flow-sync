import type {
  ActivityType,
  NotificationType,
  ProjectStatus,
  TaskPriority,
  WorkspaceRole,
} from './constants';

/** The only user shape ever sent to a client. Emails are included only where the viewer is entitled to them. */
export interface UserSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface CurrentUser extends UserSummary {
  email: string;
  timezone: string;
  createdAt: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  emailNotifications: boolean;
  notifyOnAssignment: boolean;
  notifyOnMention: boolean;
  notifyOnComment: boolean;
  notifyOnDueSoon: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: WorkspaceRole;
  memberCount: number;
  isDemo: boolean;
}

export interface WorkspaceMemberView {
  id: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: UserSummary & { email: string };
  projectCount: number;
}

export interface InvitationView {
  id: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
  expiresAt: string;
  invitedBy: UserSummary;
}

export interface LabelView {
  id: string;
  name: string;
  color: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  icon: string;
  createdAt: string;
  updatedAt: string;
  lead: UserSummary | null;
  memberCount: number;
  taskCount: number;
  completedTaskCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMemberView[];
  boards: BoardSummary[];
}

export interface ProjectMemberView {
  id: string;
  user: UserSummary;
  workspaceRole: WorkspaceRole;
  addedAt: string;
}

export interface BoardSummary {
  id: string;
  name: string;
  projectId: string;
  isDefault: boolean;
  rank: string;
  createdAt: string;
}

export interface BoardColumnView {
  id: string;
  name: string;
  color: string;
  rank: string;
  boardId: string;
  wipLimit: number | null;
  isDone: boolean;
}

export interface SubtaskView {
  id: string;
  title: string;
  completed: boolean;
  rank: string;
  createdAt: string;
}

export interface TaskSummary {
  id: string;
  key: string;
  title: string;
  priority: TaskPriority;
  rank: string;
  columnId: string;
  boardId: string;
  projectId: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  estimate: number | null;
  storyPoints: number | null;
  assignees: UserSummary[];
  labels: LabelView[];
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  completedSubtaskCount: number;
  isDone: boolean;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  creator: UserSummary;
  subtasks: SubtaskView[];
  projectName: string;
  columnName: string;
}

export interface CommentView {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: UserSummary;
  mentions: UserSummary[];
}

export interface AttachmentView {
  id: string;
  taskId: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  uploadedBy: UserSummary;
  downloadUrl: string;
}

export interface ActivityView {
  id: string;
  type: ActivityType;
  createdAt: string;
  actor: UserSummary;
  projectId: string | null;
  taskId: string | null;
  taskKey: string | null;
  /** Rendering data: pre-resolved names so the client never has to fetch to draw a line. */
  metadata: Record<string, string | null>;
  message: string;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary | null;
  link: string | null;
  taskKey: string | null;
}

export interface PresenceUser extends UserSummary {
  lastSeenAt: string;
}

export interface BoardSnapshot {
  board: BoardSummary;
  project: ProjectSummary;
  columns: BoardColumnView[];
  tasks: TaskSummary[];
  /** Realtime sequence at the moment the snapshot was taken; the client resumes from here. */
  seq: number;
}

export interface DashboardSummary {
  assignedToMe: TaskSummary[];
  dueSoon: TaskSummary[];
  overdue: TaskSummary[];
  recentProjects: ProjectSummary[];
  recentActivity: ActivityView[];
  stats: {
    assignedOpen: number;
    completedThisWeek: number;
    dueSoon: number;
    overdue: number;
  };
}

export interface SearchResults {
  projects: ProjectSummary[];
  tasks: TaskSummary[];
  members: Array<UserSummary & { email: string; role: WorkspaceRole }>;
  comments: Array<{
    id: string;
    taskId: string;
    taskKey: string;
    excerpt: string;
    author: UserSummary;
  }>;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  details?: Array<{ path: string; message: string }>;
}
