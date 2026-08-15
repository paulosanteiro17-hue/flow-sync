import { ROLE_RANK, type WorkspaceRole } from './constants';

/**
 * The single source of truth for RBAC. The API enforces it in `RolesGuard`;
 * the web app reads the same table to decide which controls to render.
 * The UI check is a convenience — it is never the security boundary.
 */
export const PERMISSIONS = [
  'workspace:update',
  'workspace:delete',
  'workspace:transfer_ownership',
  'project:view_all',
  'project:create',
  'project:update',
  'project:delete',
  'project:manage_members',
  'board:manage',
  'task:create',
  'task:update',
  'task:delete_any',
  'comment:create',
  'comment:delete_any',
  'attachment:create',
  'attachment:delete_any',
  'member:invite',
  'member:update_role',
  'member:remove',
  'label:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MEMBER_PERMISSIONS: Permission[] = [
  'project:view_all',
  'board:manage',
  'task:create',
  'task:update',
  'comment:create',
  'attachment:create',
];

const GUEST_PERMISSIONS: Permission[] = ['comment:create'];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  'workspace:update',
  'project:create',
  'project:update',
  'project:delete',
  'project:manage_members',
  'task:delete_any',
  'comment:delete_any',
  'attachment:delete_any',
  'member:invite',
  'member:update_role',
  'member:remove',
  'label:manage',
];

const OWNER_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  'workspace:delete',
  'workspace:transfer_ownership',
];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  OWNER: Object.freeze(OWNER_PERMISSIONS),
  ADMIN: Object.freeze(ADMIN_PERMISSIONS),
  MEMBER: Object.freeze(MEMBER_PERMISSIONS),
  GUEST: Object.freeze(GUEST_PERMISSIONS),
};

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAll(role: WorkspaceRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((permission) => can(role, permission));
}

export function canAny(role: WorkspaceRole | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

/**
 * An actor may only change or remove members strictly below their own rank.
 * Owners are the exception: they outrank everyone, including other owners,
 * but the "last owner" invariant is enforced separately in the service layer.
 */
export function outranks(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (actor === 'OWNER') return true;
  return ROLE_RANK[actor] > ROLE_RANK[target];
}

/** Roles an actor is allowed to grant. Admins can never mint an Owner. */
export function assignableRoles(actor: WorkspaceRole): WorkspaceRole[] {
  if (actor === 'OWNER') return ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'];
  if (actor === 'ADMIN') return ['ADMIN', 'MEMBER', 'GUEST'];
  return [];
}
