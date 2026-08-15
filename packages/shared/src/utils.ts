import type { ActivityType } from './constants';

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export function taskKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/** Derives a default project key from its name, e.g. "Website Redesign" → "WEB". */
export function suggestProjectKey(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'PROJ';
  if (words.length === 1) return words[0]!.slice(0, 4).padEnd(2, 'X');
  return words
    .slice(0, 4)
    .map((word) => word.charAt(0))
    .join('');
}

const MENTION_PATTERN = /@\[([^\]]{1,80})\]\(([A-Za-z0-9_-]{8,64})\)/g;

/**
 * Comment bodies store mentions as `@[Display Name](userId)` so the rendered text
 * never has to be parsed for a user lookup and renaming a user cannot break a link.
 */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    if (match[2]) ids.add(match[2]);
  }
  return [...ids];
}

export interface MentionToken {
  type: 'text' | 'mention';
  value: string;
  userId?: string;
}

export function tokenizeMentions(body: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      tokens.push({ type: 'text', value: body.slice(lastIndex, index) });
    }
    tokens.push({ type: 'mention', value: match[1] ?? '', userId: match[2] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    tokens.push({ type: 'text', value: body.slice(lastIndex) });
  }
  return tokens;
}

/** Plain-text rendering of a comment, used for notification bodies and search excerpts. */
export function stripMentionMarkup(body: string): string {
  return body.replace(MENTION_PATTERN, (_match, name: string) => `@${name}`);
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  // One decimal below 10 ("2.0 KB"), none above ("512 KB") — keeps the column narrow.
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export interface ActivityMessageContext {
  actorName: string;
  taskKey?: string | null;
  metadata?: Record<string, string | null> | undefined;
}

/**
 * Builds the human-readable activity line. Lives in shared so the API can persist a
 * rendered message and the tests can assert on the exact wording.
 */
export function buildActivityMessage(type: ActivityType, ctx: ActivityMessageContext): string {
  const meta = ctx.metadata ?? {};
  const actor = ctx.actorName;
  const target = ctx.taskKey ?? meta.taskKey ?? 'a task';
  const from = meta.from ?? '';
  const to = meta.to ?? '';

  switch (type) {
    case 'PROJECT_CREATED':
      return `${actor} created project ${meta.projectName ?? ''}`.trim();
    case 'PROJECT_UPDATED':
      return `${actor} updated project ${meta.projectName ?? ''}`.trim();
    case 'PROJECT_ARCHIVED':
      return `${actor} archived project ${meta.projectName ?? ''}`.trim();
    case 'BOARD_CREATED':
      return `${actor} created board ${meta.boardName ?? ''}`.trim();
    case 'BOARD_UPDATED':
      return `${actor} renamed board ${from} to ${to}`;
    case 'COLUMN_CREATED':
      return `${actor} added column ${meta.columnName ?? ''}`.trim();
    case 'COLUMN_UPDATED':
      return `${actor} renamed column ${from} to ${to}`;
    case 'COLUMN_DELETED':
      return `${actor} deleted column ${meta.columnName ?? ''}`.trim();
    case 'TASK_CREATED':
      return `${actor} created ${target}`;
    case 'TASK_UPDATED':
      return `${actor} updated ${target}`;
    case 'TASK_MOVED':
      return `${actor} moved ${target} from ${from} to ${to}`;
    case 'TASK_DELETED':
      return `${actor} deleted ${target}`;
    case 'TASK_ASSIGNED':
      return `${actor} assigned ${meta.assigneeName ?? 'someone'} to ${target}`;
    case 'TASK_UNASSIGNED':
      return `${actor} unassigned ${meta.assigneeName ?? 'someone'} from ${target}`;
    case 'TASK_PRIORITY_CHANGED':
      return `${actor} changed priority of ${target} from ${from} to ${to}`;
    case 'TASK_DUE_DATE_CHANGED':
      return to
        ? `${actor} set the due date of ${target} to ${to}`
        : `${actor} removed the due date of ${target}`;
    case 'TASK_LABEL_ADDED':
      return `${actor} added label ${meta.labelName ?? ''} to ${target}`.replace('  ', ' ');
    case 'TASK_LABEL_REMOVED':
      return `${actor} removed label ${meta.labelName ?? ''} from ${target}`.replace('  ', ' ');
    case 'SUBTASK_CREATED':
      return `${actor} added a subtask to ${target}`;
    case 'SUBTASK_COMPLETED':
      return `${actor} completed a subtask on ${target}`;
    case 'COMMENT_CREATED':
      return `${actor} commented on ${target}`;
    case 'ATTACHMENT_ADDED':
      return `${actor} attached ${meta.filename ?? 'a file'} to ${target}`;
    case 'ATTACHMENT_REMOVED':
      return `${actor} removed ${meta.filename ?? 'a file'} from ${target}`;
    case 'MEMBER_JOINED':
      return `${meta.memberName ?? actor} joined the workspace`;
    case 'MEMBER_ROLE_CHANGED':
      return `${actor} changed ${meta.memberName ?? 'a member'}'s role from ${from} to ${to}`;
    case 'MEMBER_REMOVED':
      return `${actor} removed ${meta.memberName ?? 'a member'} from the workspace`;
    default: {
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}
