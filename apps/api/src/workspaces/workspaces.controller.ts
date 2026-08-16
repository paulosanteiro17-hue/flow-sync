import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createLabelSchema,
  createWorkspaceSchema,
  transferOwnershipSchema,
  updateLabelSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  type CreateInvitationInput,
  type CreatedInvitation,
  type CreateLabelInput,
  type CreateWorkspaceInput,
  type InvitationView,
  type LabelView,
  type UpdateLabelInput,
  type UpdateMemberRoleInput,
  type UpdateWorkspaceInput,
  type WorkspaceMemberView,
  type WorkspaceSummary,
} from '@flowsync/shared';
import { CurrentUser, Public, RateLimit, RequirePermissions } from '../common/decorators';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../common/auth-context';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'Workspaces the current user belongs to' })
  list(@CurrentUser() user: AuthenticatedUser): Promise<WorkspaceSummary[]> {
    return this.workspaces.listForUser(user.userId);
  }

  @Post()
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000, scope: 'user', name: 'workspace:create' })
  @ApiOperation({ summary: 'Create a workspace (the creator becomes its owner)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(createWorkspaceSchema)) body: CreateWorkspaceInput,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.create(user.userId, body);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Workspace details for a member' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.get(user.userId, workspaceId);
  }

  @Patch(':workspaceId')
  @RequirePermissions('workspace:update')
  @ApiOperation({ summary: 'Rename a workspace or change its logo' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(updateWorkspaceSchema)) body: UpdateWorkspaceInput,
  ): Promise<WorkspaceSummary> {
    return this.workspaces.update(user.userId, workspaceId, body);
  }

  @Delete(':workspaceId')
  @RequirePermissions('workspace:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workspace and everything in it' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<void> {
    return this.workspaces.remove(user.userId, workspaceId);
  }

  // --- Members -------------------------------------------------------------

  @Get(':workspaceId/members')
  @ApiOperation({ summary: 'Team roster with roles and project counts' })
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceMemberView[]> {
    return this.workspaces.listMembers(user.userId, workspaceId);
  }

  @Patch(':workspaceId/members/:userId')
  @RequirePermissions('member:update_role')
  @ApiOperation({ summary: 'Change a member role' })
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
    @Body(zodBody(updateMemberRoleSchema)) body: UpdateMemberRoleInput,
  ): Promise<WorkspaceMemberView[]> {
    return this.workspaces.updateMemberRole(user.userId, workspaceId, targetUserId, body.role);
  }

  @Delete(':workspaceId/members/:userId')
  @RequirePermissions('member:remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the workspace' })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    return this.workspaces.removeMember(user.userId, workspaceId, targetUserId);
  }

  @Post(':workspaceId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a workspace' })
  leave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<void> {
    return this.workspaces.leave(user.userId, workspaceId);
  }

  @Post(':workspaceId/transfer-ownership')
  @RequirePermissions('workspace:transfer_ownership')
  @ApiOperation({ summary: 'Hand ownership to another member' })
  transferOwnership(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(transferOwnershipSchema)) body: { userId: string },
  ): Promise<WorkspaceMemberView[]> {
    return this.workspaces.transferOwnership(user.userId, workspaceId, body.userId);
  }

  // --- Invitations ---------------------------------------------------------

  @Get(':workspaceId/invitations')
  @RequirePermissions('member:invite')
  @ApiOperation({ summary: 'Pending invitations' })
  listInvitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<InvitationView[]> {
    return this.workspaces.listInvitations(user.userId, workspaceId);
  }

  @Post(':workspaceId/invitations')
  @RequirePermissions('member:invite')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'workspace', name: 'workspace:invite' })
  @ApiOperation({
    summary: 'Invite someone by email',
    description:
      'The response carries the accept link. It is returned only here — the database stores just a hash of the token.',
  })
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(createInvitationSchema)) body: CreateInvitationInput,
  ): Promise<CreatedInvitation> {
    return this.workspaces.invite(user.userId, workspaceId, body);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @RequirePermissions('member:invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an invitation, invalidating its link' })
  revokeInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
  ): Promise<void> {
    return this.workspaces.revokeInvitation(user.userId, workspaceId, invitationId);
  }

  // --- Labels --------------------------------------------------------------

  @Get(':workspaceId/labels')
  @ApiOperation({ summary: 'Workspace label palette' })
  listLabels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ): Promise<LabelView[]> {
    return this.workspaces.listLabels(user.userId, workspaceId);
  }

  @Post(':workspaceId/labels')
  @RequirePermissions('label:manage')
  @ApiOperation({ summary: 'Create a label' })
  createLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body(zodBody(createLabelSchema)) body: CreateLabelInput,
  ): Promise<LabelView> {
    return this.workspaces.createLabel(user.userId, workspaceId, body);
  }

  @Patch(':workspaceId/labels/:labelId')
  @RequirePermissions('label:manage')
  @ApiOperation({ summary: 'Rename or recolour a label' })
  updateLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('labelId') labelId: string,
    @Body(zodBody(updateLabelSchema)) body: UpdateLabelInput,
  ): Promise<LabelView> {
    return this.workspaces.updateLabel(user.userId, workspaceId, labelId, body);
  }

  @Delete(':workspaceId/labels/:labelId')
  @RequirePermissions('label:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a label' })
  deleteLabel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('labelId') labelId: string,
  ): Promise<void> {
    return this.workspaces.deleteLabel(user.userId, workspaceId, labelId);
  }
}

/** Invitation links are opened by people who may not be a member yet, so these live outside the workspace scope. */
@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /**
   * Public on purpose: the token itself is the secret, and someone who has not
   * signed up yet still needs to see what they are being invited to.
   */
  @Public()
  @Get(':token')
  @ApiOperation({ summary: 'Describe an invitation without consuming it' })
  preview(@Param('token') token: string) {
    return this.workspaces.previewInvitation(token);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept an invitation as the signed-in user' })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodBody(acceptInvitationSchema)) body: { token: string },
  ): Promise<WorkspaceSummary> {
    return this.workspaces.acceptInvitation(user.userId, body.token);
  }
}
