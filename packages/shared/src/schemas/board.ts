import { z } from 'zod';
import { LIMITS } from '../constants';
import { hexColorSchema, idSchema, requiredTrimmed } from './common';

export const createBoardSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.boardNameMax, 'Board name'),
  /** When omitted the board is created with the default five-column workflow. */
  withDefaultColumns: z.boolean().default(true),
});

export const updateBoardSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.boardNameMax, 'Board name').optional(),
});

export const createColumnSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.columnNameMax, 'Column name'),
  color: hexColorSchema.default('#64748b'),
  /** Position is expressed relatively; the server computes the rank. */
  afterColumnId: idSchema.nullish(),
  wipLimit: z.number().int().min(1).max(999).nullish(),
  isDone: z.boolean().default(false),
});

export const updateColumnSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.columnNameMax, 'Column name').optional(),
  color: hexColorSchema.optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
  isDone: z.boolean().optional(),
});

export const moveColumnSchema = z.strictObject({
  beforeColumnId: idSchema.nullish(),
  afterColumnId: idSchema.nullish(),
});

export const deleteColumnQuerySchema = z.object({
  /** Where to move the tasks that live in the column being deleted. */
  moveTasksTo: idSchema.optional(),
});

export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
export type MoveColumnInput = z.infer<typeof moveColumnSchema>;
