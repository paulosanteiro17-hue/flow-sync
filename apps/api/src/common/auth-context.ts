import type { WorkspaceRole } from '@flowsync/shared';

/** Identity resolved from the access-token cookie. Never populated from a request body. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
}

/** Membership resolved from the database for the workspace named in the route. */
export interface WorkspaceContext {
  workspaceId: string;
  memberId: string;
  role: WorkspaceRole;
}

declare module 'express' {
  interface Request {
    id?: string;
    auth?: AuthenticatedUser;
    workspace?: WorkspaceContext;
    /** Socket id of the caller's realtime connection, used to suppress the echo. */
    originSocketId?: string;
  }
}
