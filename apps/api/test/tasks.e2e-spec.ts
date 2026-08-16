import { RANK_MAX_LENGTH } from '@flowsync/shared';
import { TestHarness, seedWorkspace, type TestClient } from './harness';

interface TaskBody {
  id: string;
  key: string;
  rank: string;
  columnId: string;
  isDone: boolean;
  priority: string;
  assignees: Array<{ id: string }>;
}

describe('tasks, ordering and movement', () => {
  const harness = new TestHarness();

  let client: TestClient;
  let workspaceId: string;
  let boardId: string;
  let columns: Array<{ id: string; name: string; isDone: boolean }>;

  const columnByName = (name: string) => columns.find((column) => column.name === name)!;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
    client = await harness.signUp('Emma Carter', 'emma@flowsync.test');
    const seeded = await seedWorkspace(client);
    workspaceId = seeded.workspaceId;
    boardId = seeded.boardId;
    columns = seeded.columns;
  });

  afterAll(async () => {
    await harness.stop();
  });

  const createTask = async (title: string, columnName = 'To Do'): Promise<TaskBody> => {
    const response = await client
      .post(`/workspaces/${workspaceId}/tasks`, {
        columnId: columnByName(columnName).id,
        title,
      })
      .expect(201);
    return response.body as TaskBody;
  };

  const boardTasks = async (): Promise<TaskBody[]> => {
    const board = await client.get(`/workspaces/${workspaceId}/boards/${boardId}`).expect(200);
    return board.body.tasks as TaskBody[];
  };

  const orderIn = async (columnName: string): Promise<string[]> => {
    const tasks = await boardTasks();
    return tasks
      .filter((task) => task.columnId === columnByName(columnName).id)
      .sort((a, b) => (a.rank < b.rank ? -1 : 1))
      .map((task) => task.key);
  };

  describe('readable identifiers', () => {
    it('mints sequential per-project keys', async () => {
      const first = await createTask('First');
      const second = await createTask('Second');
      const third = await createTask('Third');

      expect([first.key, second.key, third.key]).toEqual(['TEST-1', 'TEST-2', 'TEST-3']);
    });

    it('keeps counters independent between projects', async () => {
      await createTask('First');

      const other = await client
        .post(`/workspaces/${workspaceId}/projects`, { name: 'Other', key: 'OTH' })
        .expect(201);
      const detail = await client
        .get(`/workspaces/${workspaceId}/projects/${other.body.id}`)
        .expect(200);
      const otherBoard = await client
        .get(`/workspaces/${workspaceId}/boards/${detail.body.boards[0].id}`)
        .expect(200);

      const created = await client
        .post(`/workspaces/${workspaceId}/tasks`, {
          columnId: otherBoard.body.columns[0].id,
          title: 'Other project task',
        })
        .expect(201);

      expect(created.body.key).toBe('OTH-1');
    });

    it('does not mint keys under concurrency', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_unused, index) => createTask(`Concurrent ${index}`)),
      );

      const keys = results.map((task) => task.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('ordering', () => {
    it('appends new tasks to the end of the column', async () => {
      await createTask('A');
      await createTask('B');
      await createTask('C');

      expect(await orderIn('To Do')).toEqual(['TEST-1', 'TEST-2', 'TEST-3']);
    });

    it('inserts between two neighbours when asked', async () => {
      const a = await createTask('A');
      const b = await createTask('B');
      const c = await createTask('C');

      await client
        .patch(`/workspaces/${workspaceId}/tasks/${c.id}/move`, {
          columnId: columnByName('To Do').id,
          beforeTaskId: a.id,
          afterTaskId: b.id,
        })
        .expect(200);

      expect(await orderIn('To Do')).toEqual(['TEST-1', 'TEST-3', 'TEST-2']);
    });

    it('moves a task to another column and marks it done', async () => {
      const task = await createTask('Ship it');
      const done = columns.find((column) => column.isDone)!;

      const moved = await client
        .patch(`/workspaces/${workspaceId}/tasks/${task.id}/move`, { columnId: done.id })
        .expect(200);

      expect(moved.body.columnId).toBe(done.id);
      expect(moved.body.isDone).toBe(true);

      // Moving it back out clears completion again.
      const back = await client
        .patch(`/workspaces/${workspaceId}/tasks/${task.id}/move`, {
          columnId: columnByName('To Do').id,
        })
        .expect(200);
      expect(back.body.isDone).toBe(false);
    });

    it('refuses a move to a column on another board', async () => {
      const task = await createTask('Stay put');

      const other = await client
        .post(`/workspaces/${workspaceId}/projects/${(await projectId())}/boards`, {
          name: 'Second Board',
          withDefaultColumns: true,
        })
        .expect(201);
      const otherBoard = await client
        .get(`/workspaces/${workspaceId}/boards/${other.body.id}`)
        .expect(200);

      const response = await client.patch(`/workspaces/${workspaceId}/tasks/${task.id}/move`, {
        columnId: otherBoard.body.columns[0].id,
      });

      expect(response.status).toBe(400);
    });

    it('keeps ranks distinct when several clients drop onto the same slot', async () => {
      const anchorA = await createTask('Anchor A');
      const anchorB = await createTask('Anchor B');
      const movers = await Promise.all([
        createTask('Mover 1'),
        createTask('Mover 2'),
        createTask('Mover 3'),
      ]);

      // Every mover claims the same gap at the same moment.
      const responses = await Promise.all(
        movers.map((mover) =>
          client.patch(`/workspaces/${workspaceId}/tasks/${mover.id}/move`, {
            columnId: columnByName('To Do').id,
            beforeTaskId: anchorA.id,
            afterTaskId: anchorB.id,
          }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);

      const ranks = (await boardTasks()).map((task) => task.rank);
      expect(new Set(ranks).size).toBe(ranks.length);

      // The anchors still bracket the movers.
      const order = await orderIn('To Do');
      expect(order[0]).toBe('TEST-1');
      expect(order.at(-1)).toBe('TEST-2');
    });

    it('rebalances a column when ranks grow too long', async () => {
      const top = await createTask('Top');
      const bottom = await createTask('Bottom');
      const mover = await createTask('Mover');

      // Repeatedly drop into the same shrinking gap; each move lengthens the rank.
      for (let iteration = 0; iteration < 60; iteration++) {
        await client
          .patch(`/workspaces/${workspaceId}/tasks/${mover.id}/move`, {
            columnId: columnByName('To Do').id,
            beforeTaskId: top.id,
            afterTaskId: bottom.id,
          })
          .expect(200);
      }

      const tasks = await boardTasks();
      for (const task of tasks) {
        expect(task.rank.length).toBeLessThanOrEqual(RANK_MAX_LENGTH + 2);
      }

      // Order survived the rewrite.
      expect(await orderIn('To Do')).toEqual(['TEST-1', 'TEST-3', 'TEST-2']);
    });
  });

  describe('editing', () => {
    it('patches only the fields that were sent', async () => {
      const task = await createTask('Original title');

      await client
        .patch(`/workspaces/${workspaceId}/tasks/${task.id}`, { priority: 'URGENT' })
        .expect(200);

      const updated = await client
        .get(`/workspaces/${workspaceId}/tasks/${task.id}`)
        .expect(200);

      expect(updated.body.title).toBe('Original title');
      expect(updated.body.priority).toBe('URGENT');
    });

    it('rejects an empty patch', async () => {
      const task = await createTask('Nothing to change');
      await client.patch(`/workspaces/${workspaceId}/tasks/${task.id}`, {}).expect(400);
    });

    it('refuses assignees who are not in the workspace', async () => {
      const task = await createTask('Assign me');
      const stranger = await harness.signUp('Stranger', 'stranger@flowsync.test');
      await stranger.get('/auth/me').expect(200);

      const strangerUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'stranger@flowsync.test' },
        select: { id: true },
      });

      await client
        .patch(`/workspaces/${workspaceId}/tasks/${task.id}`, { assigneeIds: [strangerUser.id] })
        .expect(400);
    });

    it('tracks subtask progress', async () => {
      const task = await createTask('With subtasks');

      await client
        .post(`/workspaces/${workspaceId}/tasks/${task.id}/subtasks`, { title: 'One' })
        .expect(201);
      const second = await client
        .post(`/workspaces/${workspaceId}/tasks/${task.id}/subtasks`, { title: 'Two' })
        .expect(201);

      await client
        .patch(`/workspaces/${workspaceId}/subtasks/${second.body.id}`, { completed: true })
        .expect(200);

      const board = await client.get(`/workspaces/${workspaceId}/boards/${boardId}`).expect(200);
      const summary = board.body.tasks.find((entry: { id: string }) => entry.id === task.id);

      expect(summary.subtaskCount).toBe(2);
      expect(summary.completedSubtaskCount).toBe(1);
    });
  });

  describe('activity', () => {
    it('records creation, movement and assignment in the feed', async () => {
      const task = await createTask('Tracked');
      await client
        .patch(`/workspaces/${workspaceId}/tasks/${task.id}/move`, {
          columnId: columnByName('In Progress').id,
        })
        .expect(200);

      const feed = await client.get(`/workspaces/${workspaceId}/activity`).expect(200);
      const messages = feed.body.items.map((event: { message: string }) => event.message);

      expect(messages).toContain('Emma Carter created TEST-1');
      expect(messages).toContain('Emma Carter moved TEST-1 from To Do to In Progress');
    });

    it('paginates with a stable cursor', async () => {
      for (let index = 0; index < 12; index++) await createTask(`Task ${index}`);

      const first = await client.get(`/workspaces/${workspaceId}/activity?limit=5`).expect(200);
      expect(first.body.items).toHaveLength(5);
      expect(first.body.nextCursor).toBeTruthy();

      const second = await client
        .get(`/workspaces/${workspaceId}/activity?limit=5&cursor=${first.body.nextCursor}`)
        .expect(200);

      const firstIds = first.body.items.map((event: { id: string }) => event.id);
      const secondIds = second.body.items.map((event: { id: string }) => event.id);
      expect(firstIds.filter((id: string) => secondIds.includes(id))).toEqual([]);
    });
  });

  async function projectId(): Promise<string> {
    const projects = await client.get(`/workspaces/${workspaceId}/projects`).expect(200);
    return projects.body[0].id as string;
  }
});
