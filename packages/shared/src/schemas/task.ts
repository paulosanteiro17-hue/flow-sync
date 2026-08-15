import { z } from 'zod';
import { LIMITS, TASK_PRIORITIES } from '../constants';
import { idSchema, isoDateString, optionalTrimmed, requiredTrimmed } from './common';

export const createTaskSchema = z.strictObject({
  columnId: idSchema,
  title: requiredTrimmed(LIMITS.taskTitleMax, 'Title'),
  description: optionalTrimmed(LIMITS.taskDescriptionMax),
  priority: z.enum(TASK_PRIORITIES).default('NONE'),
  dueDate: isoDateString.nullish(),
  assigneeIds: z.array(idSchema).max(LIMITS.maxAssigneesPerTask).default([]),
  labelIds: z.array(idSchema).max(LIMITS.maxLabelsPerTask).default([]),
  estimate: z.number().int().min(0).max(1000).nullish(),
  storyPoints: z.number().int().min(0).max(100).nullish(),
  /** Drop position inside the target column; omitted means "append to the top". */
  beforeTaskId: idSchema.nullish(),
  afterTaskId: idSchema.nullish(),
});

export const updateTaskSchema = z
  .strictObject({
    title: requiredTrimmed(LIMITS.taskTitleMax, 'Title').optional(),
    description: z.string().trim().max(LIMITS.taskDescriptionMax).nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: isoDateString.nullable().optional(),
    estimate: z.number().int().min(0).max(1000).nullable().optional(),
    storyPoints: z.number().int().min(0).max(100).nullable().optional(),
    assigneeIds: z.array(idSchema).max(LIMITS.maxAssigneesPerTask).optional(),
    labelIds: z.array(idSchema).max(LIMITS.maxLabelsPerTask).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes provided' });

/**
 * Movement is expressed relative to neighbours rather than as an absolute rank.
 * The server resolves the neighbours inside a transaction and computes the rank
 * itself, so two people dropping onto the same slot cannot collide.
 */
export const moveTaskSchema = z.strictObject({
  columnId: idSchema,
  beforeTaskId: idSchema.nullish(),
  afterTaskId: idSchema.nullish(),
});

export const createSubtaskSchema = z.strictObject({
  title: requiredTrimmed(LIMITS.subtaskTitleMax, 'Subtask title'),
});

export const updateSubtaskSchema = z
  .strictObject({
    title: requiredTrimmed(LIMITS.subtaskTitleMax, 'Subtask title').optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes provided' });

export const listTasksQuerySchema = z.object({
  boardId: idSchema.optional(),
  projectId: idSchema.optional(),
  assigneeId: idSchema.optional(),
  labelId: idSchema.optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  search: z.string().trim().max(LIMITS.searchQueryMax).optional(),
  dueBefore: isoDateString.optional(),
  dueAfter: isoDateString.optional(),
  status: z.enum(['open', 'done', 'all']).default('all'),
});

export const myTasksQuerySchema = z.object({
  bucket: z.enum(['all', 'today', 'overdue', 'upcoming', 'completed']).default('all'),
  search: z.string().trim().max(LIMITS.searchQueryMax).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  projectId: idSchema.optional(),
  sort: z.enum(['due', 'priority', 'created', 'updated']).default('due'),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>;
