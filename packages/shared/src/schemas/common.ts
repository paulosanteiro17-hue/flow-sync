import { z } from 'zod';
import { LIMITS } from '../constants';

/** Prisma cuid/uuid ids: opaque, but we still refuse absurd input before it reaches the database. */
export const idSchema = z.string().min(8).max(64);

export const isoDateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Must be a valid ISO date' });

export const nullableIsoDateString = isoDateString.nullable();

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color such as #6366f1');

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only lowercase letters, numbers and hyphens');

export const cursorPaginationSchema = z.object({
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});

export type CursorPaginationInput = z.infer<typeof cursorPaginationSchema>;

/**
 * Trims a string and turns the empty result into `undefined`, so a cleared form
 * field is treated as "not provided" rather than as an empty value.
 */
export const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

export const requiredTrimmed = (max: number, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max);
