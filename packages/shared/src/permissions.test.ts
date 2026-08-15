import { describe, expect, it } from 'vitest';
import { WORKSPACE_ROLES } from './constants';
import { assignableRoles, can, canAll, canAny, outranks } from './permissions';

describe('can', () => {
  it('grants owners everything', () => {
    expect(can('OWNER', 'workspace:delete')).toBe(true);
    expect(can('OWNER', 'task:create')).toBe(true);
  });

  it('stops admins short of owner-only powers', () => {
    expect(can('ADMIN', 'workspace:update')).toBe(true);
    expect(can('ADMIN', 'workspace:delete')).toBe(false);
    expect(can('ADMIN', 'workspace:transfer_ownership')).toBe(false);
  });

  it('lets members work but not administrate', () => {
    expect(can('MEMBER', 'task:create')).toBe(true);
    expect(can('MEMBER', 'task:update')).toBe(true);
    expect(can('MEMBER', 'project:create')).toBe(false);
    expect(can('MEMBER', 'member:invite')).toBe(false);
    expect(can('MEMBER', 'task:delete_any')).toBe(false);
  });

  it('limits guests to commenting', () => {
    expect(can('GUEST', 'comment:create')).toBe(true);
    expect(can('GUEST', 'task:create')).toBe(false);
    expect(can('GUEST', 'project:view_all')).toBe(false);
    expect(can('GUEST', 'attachment:create')).toBe(false);
  });

  it('denies everything for a missing role', () => {
    expect(can(null, 'comment:create')).toBe(false);
    expect(can(undefined, 'task:create')).toBe(false);
  });

  it('combines permissions', () => {
    expect(canAll('ADMIN', ['task:create', 'member:invite'])).toBe(true);
    expect(canAll('MEMBER', ['task:create', 'member:invite'])).toBe(false);
    expect(canAny('MEMBER', ['task:create', 'member:invite'])).toBe(true);
    expect(canAny('GUEST', ['task:create', 'member:invite'])).toBe(false);
  });
});

describe('outranks', () => {
  it('lets owners act on anyone', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(outranks('OWNER', role)).toBe(true);
    }
  });

  it('prevents admins from acting on owners or other admins', () => {
    expect(outranks('ADMIN', 'OWNER')).toBe(false);
    expect(outranks('ADMIN', 'ADMIN')).toBe(false);
    expect(outranks('ADMIN', 'MEMBER')).toBe(true);
    expect(outranks('ADMIN', 'GUEST')).toBe(true);
  });

  it('gives members and guests no authority', () => {
    expect(outranks('MEMBER', 'GUEST')).toBe(true);
    expect(outranks('MEMBER', 'MEMBER')).toBe(false);
    expect(outranks('GUEST', 'GUEST')).toBe(false);
  });
});

describe('assignableRoles', () => {
  it('never lets an admin mint an owner', () => {
    expect(assignableRoles('ADMIN')).not.toContain('OWNER');
    expect(assignableRoles('OWNER')).toContain('OWNER');
    expect(assignableRoles('MEMBER')).toEqual([]);
    expect(assignableRoles('GUEST')).toEqual([]);
  });
});
