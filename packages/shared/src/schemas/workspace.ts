import { z } from 'zod';
import { LIMITS, WORKSPACE_ROLES } from '../constants';
import { emailSchema } from './auth';
import { hexColorSchema, idSchema, optionalTrimmed, requiredTrimmed } from './common';

export const createWorkspaceSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.workspaceNameMax, 'Workspace name'),
});

export const updateWorkspaceSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.workspaceNameMax, 'Workspace name').optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
});

/** Owners are never invitable directly — ownership is transferred, not granted. */
export const invitableRoleSchema = z.enum(['ADMIN', 'MEMBER', 'GUEST']);

export const createInvitationSchema = z.strictObject({
  email: emailSchema,
  role: invitableRoleSchema.default('MEMBER'),
});

export const updateMemberRoleSchema = z.strictObject({
  role: z.enum(WORKSPACE_ROLES),
});

export const transferOwnershipSchema = z.strictObject({
  userId: idSchema,
});

export const createLabelSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.labelNameMax, 'Label name'),
  color: hexColorSchema,
});

export const updateLabelSchema = z.strictObject({
  name: requiredTrimmed(LIMITS.labelNameMax, 'Label name').optional(),
  color: hexColorSchema.optional(),
});

export const updateProfileSchema = z.strictObject({
  name: requiredTrimmed(80, 'Name').optional(),
  timezone: optionalTrimmed(64),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const updatePreferencesSchema = z.strictObject({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  emailNotifications: z.boolean().optional(),
  notifyOnAssignment: z.boolean().optional(),
  notifyOnMention: z.boolean().optional(),
  notifyOnComment: z.boolean().optional(),
  notifyOnDueSoon: z.boolean().optional(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
