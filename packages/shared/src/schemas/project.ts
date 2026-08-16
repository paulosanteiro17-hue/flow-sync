import { z } from 'zod';
import { LIMITS, PROJECT_STATUSES } from '../constants';
import { hexColorSchema, idSchema, optionalTrimmed, requiredTrimmed } from './common';

/** `WEB`, `APP`, `FLOW` — used to build readable task keys such as `WEB-101`. */
export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(LIMITS.projectPrefixMin, `At least ${LIMITS.projectPrefixMin} characters`)
  .max(LIMITS.projectPrefixMax, `At most ${LIMITS.projectPrefixMax} characters`)
  .regex(/^[A-Z][A-Z0-9]*$/, 'Letters and numbers only, starting with a letter');

export const createProjectSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.projectNameMax, 'Project name'),
  key: projectKeySchema,
  description: optionalTrimmed(2_000),
  status: z.enum(PROJECT_STATUSES).default('PLANNING'),
  color: hexColorSchema.default('#6366f1'),
  icon: optionalTrimmed(8),
  leadId: idSchema.nullish(),
  memberIds: z.array(idSchema).max(100).default([]),
});

export const updateProjectSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.projectNameMax, 'Project name').optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  color: hexColorSchema.optional(),
  icon: z.string().trim().max(8).optional(),
  key: projectKeySchema.optional(),
  leadId: idSchema.nullable().optional(),
});

export const projectMembersSchema = z.strictObject({
  userIds: z.array(idSchema).min(1).max(100),
});

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  search: z.string().trim().max(LIMITS.searchQueryMax).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

/**
 * Schemas with defaults have a different input and output shape. Forms bind to
 * the input type (fields may be absent) while services receive the output type
 * (defaults applied), so both are exported.
 */
export type CreateProjectFormInput = z.input<typeof createProjectSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
