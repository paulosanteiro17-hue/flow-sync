import { z } from 'zod';
import { LIMITS, NOTIFICATION_TYPES } from '../constants';
import { idSchema, requiredTrimmed } from './common';

export const createCommentSchema = z.strictObject({
  body: requiredTrimmed(LIMITS.commentBodyMax, 'Comment'),
  /** Resolved server-side against workspace membership; unknown ids are dropped. */
  mentionedUserIds: z.array(idSchema).max(20).default([]),
});

export const updateCommentSchema = z.strictObject({
  body: requiredTrimmed(LIMITS.commentBodyMax, 'Comment'),
  mentionedUserIds: z.array(idSchema).max(20).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Type something to search').max(LIMITS.searchQueryMax),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  types: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((item) => item.trim()) : undefined))
    .pipe(z.array(z.enum(['projects', 'tasks', 'members', 'comments'])).optional()),
});

export const notificationsQuerySchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(20),
  unreadOnly: z.coerce.boolean().default(false),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});

export const activityQuerySchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(20),
  projectId: idSchema.optional(),
  taskId: idSchema.optional(),
});

export const markNotificationsReadSchema = z.strictObject({
  ids: z.array(idSchema).min(1).max(200),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
