import { TestClient, TestHarness, seedWorkspace } from './harness';

/**
 * Rate limiting is switched off for the other suites so they can run repeatedly;
 * this one turns it on and proves the budgets are real.
 */
describe('rate limiting', () => {
  const harness = new TestHarness();

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    await harness.stop();
  });

  it('locks out repeated failed sign-ins for the same email', async () => {
    await harness.signUp('Target', 'target@flowsync.test', 'CorrectHorse42');

    const client = new TestClient(harness.server);
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 7; attempt++) {
      const response = await client.post('/auth/sign-in', {
        email: 'target@flowsync.test',
        password: 'WrongPassword99',
      });
      statuses.push(response.status);
    }

    // Five attempts are allowed, then the bucket is empty.
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);

    // Even the correct password is refused while the bucket is empty, which is
    // what makes the control meaningful.
    const blocked = await client.post('/auth/sign-in', {
      email: 'target@flowsync.test',
      password: 'CorrectHorse42',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('keeps the budget per email, so one account cannot lock out another', async () => {
    await harness.signUp('First', 'first@flowsync.test', 'CorrectHorse42');
    await harness.signUp('Second', 'second@flowsync.test', 'CorrectHorse42');

    const client = new TestClient(harness.server);
    for (let attempt = 0; attempt < 6; attempt++) {
      await client.post('/auth/sign-in', {
        email: 'first@flowsync.test',
        password: 'WrongPassword99',
      });
    }

    const other = await client.post('/auth/sign-in', {
      email: 'second@flowsync.test',
      password: 'CorrectHorse42',
    });
    expect(other.status).toBe(200);
  });

  it('reports the remaining budget in response headers', async () => {
    const client = await harness.signUp('Header', 'header@flowsync.test');
    const workspace = await seedWorkspace(client, 'Headers');

    const response = await client.post(`/workspaces/${workspace.workspaceId}/invitations`, {
      email: 'invitee@flowsync.test',
      role: 'MEMBER',
    });

    expect(response.status).toBe(201);
    expect(Number(response.headers['x-ratelimit-limit'])).toBe(30);
    expect(Number(response.headers['x-ratelimit-remaining'])).toBe(29);
  });

  it('limits comment creation per user', async () => {
    const client = await harness.signUp('Chatty', 'chatty@flowsync.test');
    const workspace = await seedWorkspace(client, 'Chatty Workspace');
    const todo = workspace.columns.find((column) => column.name === 'To Do')!;

    const task = await client
      .post(`/workspaces/${workspace.workspaceId}/tasks`, { columnId: todo.id, title: 'Discuss' })
      .expect(201);

    let limited = false;
    for (let attempt = 0; attempt < 65; attempt++) {
      const response = await client.post(
        `/workspaces/${workspace.workspaceId}/tasks/${task.body.id}/comments`,
        { body: `Comment ${attempt}` },
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
    }

    expect(limited).toBe(true);
  });
});
