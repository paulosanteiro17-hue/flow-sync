import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_LABELS,
  ROLE_LABELS,
  assignableRoles,
  can,
  outranks,
  slugify,
  type CreateInvitationInput,
  type CreateLabelInput,
  type CreateWorkspaceInput,
  type InvitationView,
  type LabelView,
  type UpdateLabelInput,
  type UpdateWorkspaceInput,
  type WorkspaceMemberView,
  type WorkspaceRole,
  type WorkspaceSummary,
} from '@flowsync/shared';
import { createHash, randomBytes } from 'node:crypto';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';
import { AccessService } from '../common/access.service';
import { AppException, ERROR_CODES } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly mailer: MailerService,
    @Inject(CONFIG_TOKEN) private readonly config: AppConfig,
  ) {}

  // -------------------------------------------------------------------------
  // Workspaces
  // -------------------------------------------------------------------------

  async listForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            isDemo: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      logoUrl: membership.workspace.logoUrl,
      role: membership.role,
      memberCount: membership.workspace._count.members,
      isDemo: membership.workspace.isDemo,
    }));
  }

  async create(userId: string, input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const slug = await this.uniqueSlug(input.name);

    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          slug,
          members: { create: { userId, role: 'OWNER' } },
          labels: { create: DEFAULT_LABELS.map((label) => ({ ...label })) },
        },
        select: { id: true, name: true, slug: true, logoUrl: true, isDemo: true },
      });
      return created;
    });

    await this.activity.record({
      workspaceId: workspace.id,
      actorId: userId,
      type: 'MEMBER_JOINED',
      metadata: { memberName: (await this.userName(userId)) ?? 'Someone' },
    });

    return { ...workspace, role: 'OWNER', memberCount: 1 };
  }

  async get(userId: string, workspaceId: string): Promise<WorkspaceSummary> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        isDemo: true,
        _count: { select: { members: true } },
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      logoUrl: workspace.logoUrl,
      role: membership.role,
      memberCount: workspace._count.members,
      isDemo: workspace.isDemo,
    };
  }

  async update(
    userId: string,
    workspaceId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceSummary> {
    await this.access.requireWorkspace(userId, workspaceId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      },
    });
    return this.get(userId, workspaceId);
  }

  async remove(userId: string, workspaceId: string): Promise<void> {
    await this.access.requireWorkspace(userId, workspaceId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { isDemo: true },
    });
    if (workspace.isDemo) {
      throw AppException.forbidden('The shared demo workspace cannot be deleted');
    }
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  async listMembers(userId: string, workspaceId: string): Promise<WorkspaceMemberView[]> {
    await this.access.requireWorkspace(userId, workspaceId);

    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            _count: { select: { projectMembers: { where: { project: { workspaceId } } } } },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    return members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
      },
      projectCount: member.user._count.projectMembers,
    }));
  }

  async updateMemberRole(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    role: WorkspaceRole,
  ): Promise<WorkspaceMemberView[]> {
    const actor = await this.access.requireWorkspace(actorId, workspaceId);

    if (!assignableRoles(actor.role).includes(role)) {
      throw AppException.forbidden(`You cannot grant the ${ROLE_LABELS[role]} role`);
    }

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      select: { id: true, role: true, user: { select: { name: true } } },
    });
    if (!target) throw AppException.notFound('Member not found');

    if (target.role === role) return this.listMembers(actorId, workspaceId);

    if (!outranks(actor.role, target.role)) {
      throw AppException.forbidden('You cannot change the role of someone at or above your level');
    }

    // A workspace must always keep at least one owner.
    if (target.role === 'OWNER' && role !== 'OWNER') {
      await this.assertNotLastOwner(workspaceId, targetUserId);
    }

    await this.prisma.workspaceMember.update({ where: { id: target.id }, data: { role } });

    await this.activity.record({
      workspaceId,
      actorId,
      type: 'MEMBER_ROLE_CHANGED',
      metadata: {
        memberName: target.user.name,
        from: ROLE_LABELS[target.role],
        to: ROLE_LABELS[role],
      },
    });

    await this.realtime.emitToWorkspace(
      workspaceId,
      'member.updated',
      { memberId: target.id, userId: targetUserId, role, workspaceId },
      { actorId },
    );

    return this.listMembers(actorId, workspaceId);
  }

  async removeMember(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
    const actor = await this.access.requireWorkspace(actorId, workspaceId);

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      select: { id: true, role: true, user: { select: { name: true } } },
    });
    if (!target) throw AppException.notFound('Member not found');

    if (!outranks(actor.role, target.role)) {
      throw AppException.forbidden('You cannot remove someone at or above your level');
    }
    if (target.role === 'OWNER') await this.assertNotLastOwner(workspaceId, targetUserId);

    await this.prisma.workspaceMember.delete({ where: { id: target.id } });

    await this.activity.record({
      workspaceId,
      actorId,
      type: 'MEMBER_REMOVED',
      metadata: { memberName: target.user.name },
    });

    await this.realtime.emitToWorkspace(
      workspaceId,
      'member.left',
      { userId: targetUserId, workspaceId },
      { actorId },
    );
  }

  async leave(userId: string, workspaceId: string): Promise<void> {
    const membership = await this.access.requireWorkspace(userId, workspaceId);
    if (membership.role === 'OWNER') await this.assertNotLastOwner(workspaceId, userId);

    await this.prisma.workspaceMember.delete({ where: { id: membership.memberId } });
    await this.realtime.emitToWorkspace(
      workspaceId,
      'member.left',
      { userId, workspaceId },
      { actorId: userId },
    );
  }

  async transferOwnership(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
  ): Promise<WorkspaceMemberView[]> {
    const actor = await this.access.requireWorkspace(actorId, workspaceId);
    if (actor.role !== 'OWNER') throw AppException.forbidden('Only an owner can transfer ownership');
    if (actorId === targetUserId) return this.listMembers(actorId, workspaceId);

    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      select: { id: true, role: true, user: { select: { name: true } } },
    });
    if (!target) throw AppException.notFound('Member not found');

    await this.prisma.$transaction([
      this.prisma.workspaceMember.update({ where: { id: target.id }, data: { role: 'OWNER' } }),
      this.prisma.workspaceMember.update({ where: { id: actor.memberId }, data: { role: 'ADMIN' } }),
    ]);

    await this.activity.record({
      workspaceId,
      actorId,
      type: 'MEMBER_ROLE_CHANGED',
      metadata: { memberName: target.user.name, from: ROLE_LABELS[target.role], to: ROLE_LABELS.OWNER },
    });

    return this.listMembers(actorId, workspaceId);
  }

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------

  async listInvitations(userId: string, workspaceId: string): Promise<InvitationView[]> {
    await this.access.requireWorkspace(userId, workspaceId);

    const invitations = await this.prisma.invitation.findMany({
      where: { workspaceId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      invitedBy: invitation.invitedBy,
    }));
  }

  async invite(
    actorId: string,
    workspaceId: string,
    input: CreateInvitationInput,
  ): Promise<InvitationView> {
    const actor = await this.access.requireWorkspace(actorId, workspaceId);
    if (!assignableRoles(actor.role).includes(input.role)) {
      throw AppException.forbidden(`You cannot invite someone as ${ROLE_LABELS[input.role]}`);
    }

    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { name: true },
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existingUser) {
      const alreadyMember = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
        select: { id: true },
      });
      if (alreadyMember) throw AppException.conflict('That person is already a member');
    }

    // The plaintext token exists only in the email; the database keeps its hash.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.prisma.invitation.upsert({
      where: { workspaceId_email: { workspaceId, email: input.email } },
      create: {
        workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: sha256(token),
        invitedById: actorId,
        expiresAt,
      },
      update: {
        role: input.role,
        tokenHash: sha256(token),
        invitedById: actorId,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const acceptUrl = `${this.config.webOrigins[0] ?? ''}/invite/${token}`;
    await this.mailer.sendInvitation({
      to: input.email,
      workspaceName: workspace.name,
      inviterName: invitation.invitedBy.name,
      acceptUrl,
    });

    if (existingUser) {
      await this.notifications.create({
        workspaceId,
        userId: existingUser.id,
        actorId,
        type: 'INVITATION',
        title: `${invitation.invitedBy.name} invited you to ${workspace.name}`,
        body: 'Open the invitation to join the workspace.',
        link: `/invite/${token}`,
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
      invitedBy: invitation.invitedBy,
    };
  }

  async revokeInvitation(actorId: string, workspaceId: string, invitationId: string): Promise<void> {
    await this.access.requireWorkspace(actorId, workspaceId);
    const result = await this.prisma.invitation.deleteMany({
      where: { id: invitationId, workspaceId },
    });
    if (result.count === 0) throw AppException.notFound('Invitation not found');
  }

  /** Reads an invitation without consuming it, so the accept screen can describe it. */
  async previewInvitation(token: string): Promise<{
    workspaceName: string;
    role: WorkspaceRole;
    email: string;
    invitedBy: string;
  }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        workspace: { select: { name: true } },
        invitedBy: { select: { name: true } },
      },
    });

    if (!invitation || invitation.expiresAt.getTime() < Date.now()) {
      throw new AppException(
        ERROR_CODES.INVITATION_INVALID,
        'This invitation is invalid or has expired',
        410,
      );
    }

    return {
      workspaceName: invitation.workspace.name,
      role: invitation.role,
      email: invitation.email,
      invitedBy: invitation.invitedBy.name,
    };
  }

  async acceptInvitation(userId: string, token: string): Promise<WorkspaceSummary> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      select: { id: true, workspaceId: true, email: true, role: true, expiresAt: true },
    });

    if (!invitation || invitation.expiresAt.getTime() < Date.now()) {
      throw new AppException(
        ERROR_CODES.INVITATION_INVALID,
        'This invitation is invalid or has expired',
        410,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true },
    });

    // The invitation is bound to an address; a different signed-in account cannot use it.
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw AppException.forbidden(
        `This invitation was sent to ${invitation.email}. Sign in with that account to accept it.`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
        create: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
        update: {},
      }),
      // Single use: consuming the invitation deletes it.
      this.prisma.invitation.delete({ where: { id: invitation.id } }),
    ]);

    await this.activity.record({
      workspaceId: invitation.workspaceId,
      actorId: userId,
      type: 'MEMBER_JOINED',
      metadata: { memberName: user.name },
    });

    await this.realtime.emitToWorkspace(
      invitation.workspaceId,
      'member.joined',
      {
        member: { id: userId, name: user.name, avatarUrl: null },
        role: invitation.role,
        workspaceId: invitation.workspaceId,
      },
      { actorId: userId },
    );

    return this.get(userId, invitation.workspaceId);
  }

  // -------------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------------

  async listLabels(userId: string, workspaceId: string): Promise<LabelView[]> {
    await this.access.requireWorkspace(userId, workspaceId);
    return this.prisma.label.findMany({
      where: { workspaceId },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
  }

  async createLabel(
    userId: string,
    workspaceId: string,
    input: CreateLabelInput,
  ): Promise<LabelView> {
    await this.access.requireWorkspace(userId, workspaceId);
    return this.prisma.label.create({
      data: { workspaceId, name: input.name, color: input.color },
      select: { id: true, name: true, color: true },
    });
  }

  async updateLabel(
    userId: string,
    workspaceId: string,
    labelId: string,
    input: UpdateLabelInput,
  ): Promise<LabelView> {
    await this.access.requireWorkspace(userId, workspaceId);
    const existing = await this.prisma.label.findFirst({
      where: { id: labelId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw AppException.notFound('Label not found');

    return this.prisma.label.update({
      where: { id: labelId },
      data: input,
      select: { id: true, name: true, color: true },
    });
  }

  async deleteLabel(userId: string, workspaceId: string, labelId: string): Promise<void> {
    await this.access.requireWorkspace(userId, workspaceId);
    const result = await this.prisma.label.deleteMany({ where: { id: labelId, workspaceId } });
    if (result.count === 0) throw AppException.notFound('Label not found');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async assertNotLastOwner(workspaceId: string, userId: string): Promise<void> {
    const owners = await this.prisma.workspaceMember.count({
      where: { workspaceId, role: 'OWNER' },
    });
    if (owners <= 1) {
      throw new AppException(
        ERROR_CODES.LAST_OWNER,
        'A workspace must always have at least one owner. Promote someone else first.',
        409,
      );
    }
    void userId;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'workspace';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.workspace.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  private async userName(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? null;
  }

  /** Exposed for the projects module, which needs the same permission vocabulary. */
  assertPermission(role: WorkspaceRole, permission: Parameters<typeof can>[1]): void {
    this.access.assert(role, permission);
  }
}
