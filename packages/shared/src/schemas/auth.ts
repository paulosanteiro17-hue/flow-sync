import { z } from 'zod';
import { LIMITS } from '../constants';
import { idSchema, requiredTrimmed } from './common';

/**
 * A small, high-signal breach list. A production system would hit an external
 * corpus (or k-anonymity range query against HIBP); shipping the top offenders
 * inline keeps the rule enforceable offline and in tests.
 */
export const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou1',
  'admin12345',
  'welcome123',
  'flowsync123',
  'changeme123',
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax)
  .refine((value) => /[a-zA-Z]/.test(value), 'Password must contain a letter')
  .refine((value) => /[0-9]/.test(value), 'Password must contain a number')
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
    'This password appears in known breach lists',
  );

export const signUpSchema = z.strictObject({
  name: requiredTrimmed(80, 'Name'),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(LIMITS.passwordMax),
});

export const requestPasswordResetSchema = z.strictObject({
  email: emailSchema,
});

export const resetPasswordSchema = z.strictObject({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(LIMITS.passwordMax),
  newPassword: passwordSchema,
});

export const acceptInvitationSchema = z.strictObject({
  token: z.string().min(20).max(200),
});

export const revokeSessionSchema = z.strictObject({
  sessionId: idSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
