import { TestHarness, seedWorkspace, type TestClient } from './harness';

/**
 * The most important suite in the backend.
 *
 * A member of one workspace must not be able to read, mutate or even confirm the
 * existence of anything in another. Every failure here is a critical bug, so the
 * suite walks the whole resource surface rather than sampling it.
 */
describe('tenant isolation', () => {
  const harness = new TestHarness();

  let insider: TestClient;
  let outsider: TestClient;
  let tenant: Awaited<ReturnType<typeof seedWorkspace>>;
  let taskId: string;
  let commentId: string;

  beforeAll(async () => {
    await harness.start();
    await harness.reset();

    insider = await harness.signUp('Inside Person', 'inside@flowsync.test');
    outsider = await harness.signUp('Outside Person', 'outside@flowsync.test');

    tenant = await seedWorkspace(insider, 'Tenant A');

    // The outsider has their own workspace, so they are a legitimate user —
    // just not of this tenant.
    await seedWorkspace(outsider, 'Tenant B');

    const todo = tenant.columns.find((column) => column.name === 'To Do');
    const task = await insider
      .post(`/workspaces/${tenant.workspaceId}/tasks`, {
        columnId: todo?.id,
        title: 'Confidential roadmap item',
      })
      .expect(201);
    taskId = task.body.id;

    const comment = await insider
      .post(`/workspaces/${tenant.workspaceId}/tasks/${taskId}/comments`, {
        body: 'Internal discussion',
      })
      .expect(201);
    commentId = comment.body.id;
  });

  afterAll(async () => {
    await harness.stop();
  });

  describe('reads', () => {
    it('refuses every read with 404, never 403', async () => {
      // Built inside the test: the ids only exist once `beforeAll` has run.
      const base = `/workspaces/${tenant.workspaceId}`;
      const reads: Array<[string, string]> = [
        ['workspace', base],
        ['members', `${base}/members`],
        ['labels', `${base}/labels`],
        ['projects', `${base}/projects`],
        ['project', `${base}/projects/${tenant.projectId}`],
        ['board', `${base}/boards/${tenant.boardId}`],
        ['tasks', `${base}/tasks`],
        ['task', `${base}/tasks/${taskId}`],
        ['comments', `${base}/tasks/${taskId}/comments`],
        ['attachments', `${base}/tasks/${taskId}/attachments`],
        ['activity', `${base}/activity`],
        ['notifications', `${base}/notifications`],
        ['dashboard', `${base}/dashboard`],
        ['search', `${base}/search?q=roadmap`],
        ['my tasks', `${base}/my-tasks`],
      ];

      const leaks: string[] = [];
      for (const [label, path] of reads) {
        const response = await outsider.get(path);
        // 404 rather than 403 on purpose: a 403 would confirm the resource exists.
        if (response.status !== 404 || response.body.code !== 'NOT_FOUND') {
          leaks.push(`${label} -> ${response.status} ${response.body?.code ?? ''}`);
        }
      }

      expect(leaks).toEqual([]);
    });
  });

  describe('writes', () => {
    it('cannot create a task in another workspace', async () => {
      const todo = tenant.columns.find((column) => column.name === 'To Do');
      await outsider
        .post(`/workspaces/${tenant.workspaceId}/tasks`, { columnId: todo?.id, title: 'Injected' })
        .expect(404);
    });

    it('cannot update or move another workspace’s task', async () => {
      await outsider
        .patch(`/workspaces/${tenant.workspaceId}/tasks/${taskId}`, { title: 'Hacked' })
        .expect(404);

      await outsider
        .patch(`/workspaces/${tenant.workspaceId}/tasks/${taskId}/move`, {
          columnId: tenant.columns[0]?.id,
        })
        .expect(404);
    });

    it('cannot delete another workspace’s task', async () => {
      await outsider.delete(`/workspaces/${tenant.workspaceId}/tasks/${taskId}`).expect(404);
    });

    it('cannot comment on another workspace’s task', async () => {
      await outsider
        .post(`/workspaces/${tenant.workspaceId}/tasks/${taskId}/comments`, { body: 'Hello' })
        .expect(404);
    });

    it('cannot delete another workspace’s comment', async () => {
      await outsider.delete(`/workspaces/${tenant.workspaceId}/comments/${commentId}`).expect(404);
    });

    it('cannot rename another workspace or its project', async () => {
      await outsider.patch(`/workspaces/${tenant.workspaceId}`, { name: 'Owned' }).expect(404);
      await outsider
        .patch(`/workspaces/${tenant.workspaceId}/projects/${tenant.projectId}`, { name: 'Owned' })
        .expect(404);
    });

    it('cannot delete another workspace', async () => {
      await outsider.delete(`/workspaces/${tenant.workspaceId}`).expect(404);
    });

    it('cannot invite themselves into another workspace', async () => {
      await outsider
        .post(`/workspaces/${tenant.workspaceId}/invitations`, {
          email: 'outside@flowsync.test',
          role: 'ADMIN',
        })
        .expect(404);
    });

    it('leaves the data untouched after every attempt', async () => {
      const task = await insider
        .get(`/workspaces/${tenant.workspaceId}/tasks/${taskId}`)
        .expect(200);
      expect(task.body.title).toBe('Confidential roadmap item');
    });
  });

  describe('cross-tenant identifiers', () => {
    it('rejects a task id from another workspace even inside your own workspace path', async () => {
      const own = await outsider.get('/workspaces').expect(200);
      const ownWorkspaceId = own.body[0].id as string;

      // The outsider is a legitimate member here, but the task belongs elsewhere.
      await outsider.get(`/workspaces/${ownWorkspaceId}/tasks/${taskId}`).expect(404);
    });

    it('does not surface another tenant’s data through search', async () => {
      const own = await outsider.get('/workspaces').expect(200);
      const ownWorkspaceId = own.body[0].id as string;

      const results = await outsider
        .get(`/workspaces/${ownWorkspaceId}/search?q=Confidential`)
        .expect(200);

      expect(results.body.tasks).toHaveLength(0);
      expect(results.body.comments).toHaveLength(0);
    });
  });
});
