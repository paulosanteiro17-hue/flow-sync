import { TestHarness, seedWorkspace, type TestClient } from './harness';

/**
 * Verifies the permission matrix documented in `docs/SECURITY.md` against the
 * running API. The UI reads the same matrix from `@flowsync/shared`, but only
 * this suite proves the server enforces it.
 */
describe('role-based access control', () => {
  const harness = new TestHarness();

  let owner: TestClient;
  let admin: TestClient;
  let member: TestClient;
  let guest: TestClient;

  let workspaceId: string;
  let projectId: string;
  let boardId: string;
  let todoColumnId: string;
  let ownerTaskId: string;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    await harness.start();
    await harness.reset();

    owner = await harness.signUp('Emma Owner', 'owner@flowsync.test');
    admin = await harness.signUp('Daniel Admin', 'admin@flowsync.test');
    member = await harness.signUp('Sophia Member', 'member@flowsync.test');
    guest = await harness.signUp('Noah Guest', 'guest@flowsync.test');

    const seeded = await seedWorkspace(owner, 'RBAC Workspace');
    workspaceId = seeded.workspaceId;
    projectId = seeded.projectId;
    boardId = seeded.boardId;
    todoColumnId = seeded.columns.find((column) => column.name === 'To Do')!.id;

    await joinAs(admin, 'admin@flowsync.test', 'ADMIN');
    await joinAs(member, 'member@flowsync.test', 'MEMBER');
    await joinAs(guest, 'guest@flowsync.test', 'GUEST');

    // Guests only see projects they are explicitly on.
    const guestUser = await harness.prisma.user.findUniqueOrThrow({
      where: { email: 'guest@flowsync.test' },
      select: { id: true },
    });
    await owner
      .post(`/workspaces/${workspaceId}/projects/${projectId}/members`, {
        userIds: [guestUser.id],
      })
      .expect(201);

    const task = await owner
      .post(`/workspaces/${workspaceId}/tasks`, { columnId: todoColumnId, title: 'Owner task' })
      .expect(201);
    ownerTaskId = task.body.id;
  });

  afterAll(async () => {
    await harness.stop();
  });

  /** Invites a user and accepts on their behalf, which is the real join path. */
  async function joinAs(client: TestClient, email: string, role: string): Promise<void> {
    await owner.post(`/workspaces/${workspaceId}/invitations`, { email, role }).expect(201);

    const { MailerService } = await import('../src/mailer/mailer.service');
    const mailer = harness.app.get(MailerService);
    const message = mailer.outbox().at(-1);
    const token = /invite\/([\w-]+)/.exec(message?.text ?? '')?.[1];
    if (!token) throw new Error(`No invitation link was produced for ${email}`);

    await client.post('/invitations/accept', { token }).expect(201);
  }

  describe('projects', () => {
    it('lets owners and admins create projects', async () => {
      await owner
        .post(`/workspaces/${workspaceId}/projects`, { name: 'Owner Project', key: 'OWN' })
        .expect(201);
      await admin
        .post(`/workspaces/${workspaceId}/projects`, { name: 'Admin Project', key: 'ADM' })
        .expect(201);
    });

    it('stops members and guests creating projects', async () => {
      await member
        .post(`/workspaces/${workspaceId}/projects`, { name: 'Nope', key: 'NOP' })
        .expect(403);
      await guest
        .post(`/workspaces/${workspaceId}/projects`, { name: 'Nope', key: 'NPE' })
        .expect(403);
    });

    it('shows all projects to members but only assigned ones to guests', async () => {
      const memberProjects = await member.get(`/workspaces/${workspaceId}/projects`).expect(200);
      const guestProjects = await guest.get(`/workspaces/${workspaceId}/projects`).expect(200);

      expect(memberProjects.body.length).toBeGreaterThan(1);
      expect(guestProjects.body).toHaveLength(1);
      expect(guestProjects.body[0].id).toBe(projectId);
    });
  });

  describe('tasks', () => {
    it('lets members create and move tasks', async () => {
      const created = await member
        .post(`/workspaces/${workspaceId}/tasks`, { columnId: todoColumnId, title: 'Member task' })
        .expect(201);

      const board = await member.get(`/workspaces/${workspaceId}/boards/${boardId}`).expect(200);
      const inProgress = board.body.columns.find(
        (column: { name: string }) => column.name === 'In Progress',
      );

      await member
        .patch(`/workspaces/${workspaceId}/tasks/${created.body.id}/move`, {
          columnId: inProgress.id,
        })
        .expect(200);
    });

    it('stops a guest creating a task even on a project they belong to', async () => {
      await guest
        .post(`/workspaces/${workspaceId}/tasks`, { columnId: todoColumnId, title: 'Guest task' })
        .expect(403);
    });

    it('lets a member delete their own task but not someone else’s', async () => {
      const own = await member
        .post(`/workspaces/${workspaceId}/tasks`, { columnId: todoColumnId, title: 'Disposable' })
        .expect(201);

      await member.delete(`/workspaces/${workspaceId}/tasks/${own.body.id}`).expect(204);
      await member.delete(`/workspaces/${workspaceId}/tasks/${ownerTaskId}`).expect(403);
    });

    it('lets an admin delete anyone’s task', async () => {
      const target = await owner
        .post(`/workspaces/${workspaceId}/tasks`, {
          columnId: todoColumnId,
          title: 'Admin removes',
        })
        .expect(201);

      await admin.delete(`/workspaces/${workspaceId}/tasks/${target.body.id}`).expect(204);
    });
  });

  describe('comments', () => {
    it('lets a guest comment', async () => {
      await guest
        .post(`/workspaces/${workspaceId}/tasks/${ownerTaskId}/comments`, { body: 'A guest note' })
        .expect(201);
    });

    it('stops anyone editing someone else’s comment, including the owner', async () => {
      const comment = await member
        .post(`/workspaces/${workspaceId}/tasks/${ownerTaskId}/comments`, { body: 'Mine' })
        .expect(201);

      await owner
        .patch(`/workspaces/${workspaceId}/comments/${comment.body.id}`, { body: 'Rewritten' })
        .expect(403);
    });

    it('lets an admin delete any comment but a member only their own', async () => {
      const memberComment = await member
        .post(`/workspaces/${workspaceId}/tasks/${ownerTaskId}/comments`, { body: 'Delete me' })
        .expect(201);
      const ownerComment = await owner
        .post(`/workspaces/${workspaceId}/tasks/${ownerTaskId}/comments`, { body: 'Protected' })
        .expect(201);

      await member
        .delete(`/workspaces/${workspaceId}/comments/${ownerComment.body.id}`)
        .expect(403);
      await admin
        .delete(`/workspaces/${workspaceId}/comments/${memberComment.body.id}`)
        .expect(204);
    });
  });

  describe('workspace administration', () => {
    it('lets an admin rename the workspace but not delete it', async () => {
      await admin.patch(`/workspaces/${workspaceId}`, { name: 'Renamed by admin' }).expect(200);
      await admin.delete(`/workspaces/${workspaceId}`).expect(403);
    });

    it('stops a member renaming the workspace', async () => {
      await member.patch(`/workspaces/${workspaceId}`, { name: 'Nope' }).expect(403);
    });

    it('stops an admin promoting anyone to owner', async () => {
      const memberUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'member@flowsync.test' },
        select: { id: true },
      });

      const response = await admin.patch(`/workspaces/${workspaceId}/members/${memberUser.id}`, {
        role: 'OWNER',
      });
      expect(response.status).toBe(403);
    });

    it('stops an admin demoting the owner', async () => {
      const ownerUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'owner@flowsync.test' },
        select: { id: true },
      });

      await admin
        .patch(`/workspaces/${workspaceId}/members/${ownerUser.id}`, { role: 'MEMBER' })
        .expect(403);
    });

    it('refuses to leave the workspace without an owner', async () => {
      const ownerUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'owner@flowsync.test' },
        select: { id: true },
      });

      const response = await owner.patch(`/workspaces/${workspaceId}/members/${ownerUser.id}`, {
        role: 'ADMIN',
      });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('LAST_OWNER');
    });

    it('stops members and guests inviting people', async () => {
      await member
        .post(`/workspaces/${workspaceId}/invitations`, {
          email: 'x@flowsync.test',
          role: 'MEMBER',
        })
        .expect(403);
      await guest
        .post(`/workspaces/${workspaceId}/invitations`, {
          email: 'y@flowsync.test',
          role: 'MEMBER',
        })
        .expect(403);
    });
  });

  describe('invitations', () => {
    it('binds an invitation to the address it was sent to', async () => {
      await owner
        .post(`/workspaces/${workspaceId}/invitations`, {
          email: 'someone-else@flowsync.test',
          role: 'MEMBER',
        })
        .expect(201);

      const { MailerService } = await import('../src/mailer/mailer.service');
      const mailer = harness.app.get(MailerService);
      const token = /invite\/([\w-]+)/.exec(mailer.outbox().at(-1)?.text ?? '')?.[1];

      // A different signed-in account cannot consume it.
      const interloper = await harness.signUp('Interloper', 'interloper@flowsync.test');
      await interloper.post('/invitations/accept', { token }).expect(403);
    });

    it('stores only a hash of the invitation token', async () => {
      const invitation = await harness.prisma.invitation.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { tokenHash: true },
      });

      expect(invitation?.tokenHash).toHaveLength(64);
      expect(invitation?.tokenHash).toMatch(/^[a-f0-9]+$/);
    });
  });
});
