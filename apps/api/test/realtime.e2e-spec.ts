import { CLIENT_EVENTS, SERVER_EVENTS, type AnyRealtimeEnvelope } from '@flowsync/shared';
import { io, type Socket } from 'socket.io-client';
import { TestHarness, seedWorkspace, type TestClient } from './harness';

/**
 * WebSocket authentication and authorization.
 *
 * A client-supplied board id is a request, never proof of access — every
 * subscription is re-checked in the database. These tests make that promise
 * explicit, including the case that matters most: a member of one workspace
 * trying to listen in on another.
 */
describe('realtime gateway', () => {
  const harness = new TestHarness();
  const sockets: Socket[] = [];

  let baseUrl: string;
  let insider: TestClient;
  let outsider: TestClient;
  let tenant: Awaited<ReturnType<typeof seedWorkspace>>;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    await harness.start();
    baseUrl = await harness.listen();
    await harness.reset();

    insider = await harness.signUp('Inside', 'inside@flowsync.test');
    outsider = await harness.signUp('Outside', 'outside@flowsync.test');

    tenant = await seedWorkspace(insider, 'Realtime Workspace');
    await seedWorkspace(outsider, 'Other Workspace');
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });

  afterAll(async () => {
    await harness.stop();
  });

  function connect(cookie?: string): Socket {
    const socket = io(baseUrl, {
      path: '/realtime',
      transports: ['websocket'],
      reconnection: false,
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    });
    sockets.push(socket);
    return socket;
  }

  function connected(socket: Socket): Promise<boolean> {
    return new Promise((resolve) => {
      socket.on('connect', () => resolve(true));
      socket.on('connect_error', () => resolve(false));
      setTimeout(() => resolve(false), 6_000);
    });
  }

  function subscribe(socket: Socket, scope: string, id: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      socket.emit(CLIENT_EVENTS.subscribe, { scope, id }, resolve);
      setTimeout(() => resolve({ code: 'TIMEOUT' }), 6_000);
    });
  }

  describe('handshake', () => {
    it('refuses a connection with no cookie', async () => {
      const socket = connect();
      expect(await connected(socket)).toBe(false);
    });

    it('refuses a connection with a forged token', async () => {
      const socket = connect('fs_at=not.a.real.jwt');
      expect(await connected(socket)).toBe(false);
    });

    it('accepts a connection carrying a valid session cookie', async () => {
      const socket = connect(insider.cookieHeader());
      expect(await connected(socket)).toBe(true);
    });
  });

  describe('subscription authorization', () => {
    it('lets a member into their own board room', async () => {
      const socket = connect(insider.cookieHeader());
      await connected(socket);

      const ack = await subscribe(socket, 'board', tenant.boardId);
      expect(ack).toMatchObject({ room: `board:${tenant.boardId}` });
      expect(typeof ack.seq).toBe('number');
    });

    it('refuses another tenant’s board, project and workspace rooms', async () => {
      const socket = connect(outsider.cookieHeader());
      await connected(socket);

      expect(await subscribe(socket, 'board', tenant.boardId)).toMatchObject({ code: 'NOT_FOUND' });
      expect(await subscribe(socket, 'project', tenant.projectId)).toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(await subscribe(socket, 'workspace', tenant.workspaceId)).toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('refuses a made-up id without leaking whether it exists', async () => {
      const socket = connect(insider.cookieHeader());
      await connected(socket);

      expect(await subscribe(socket, 'board', 'clx000000000000000000000')).toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects a malformed subscription request', async () => {
      const socket = connect(insider.cookieHeader());
      await connected(socket);

      expect(await subscribe(socket, 'board', 'x'.repeat(200))).toMatchObject({
        code: 'BAD_REQUEST',
      });
    });
  });

  describe('event delivery', () => {
    it('delivers a task move to a subscriber, with sequence and dedupe metadata', async () => {
      const socket = connect(insider.cookieHeader());
      await connected(socket);
      await subscribe(socket, 'board', tenant.boardId);

      const received: AnyRealtimeEnvelope[] = [];
      socket.on(SERVER_EVENTS.event, (envelope: AnyRealtimeEnvelope) => received.push(envelope));

      const todo = tenant.columns.find((column) => column.name === 'To Do')!;
      const inProgress = tenant.columns.find((column) => column.name === 'In Progress')!;

      const task = await insider
        .post(`/workspaces/${tenant.workspaceId}/tasks`, {
          columnId: todo.id,
          title: 'Broadcast me',
        })
        .expect(201);

      await insider
        .patch(`/workspaces/${tenant.workspaceId}/tasks/${task.body.id}/move`, {
          columnId: inProgress.id,
        })
        .expect(200);

      await waitFor(() => received.some((envelope) => envelope.type === 'task.moved'));

      const moved = received.find((envelope) => envelope.type === 'task.moved');
      expect(moved).toBeDefined();
      expect(moved?.payload).toMatchObject({ fromColumnId: todo.id, toColumnId: inProgress.id });
      expect(typeof moved?.id).toBe('string');
      expect(moved?.seq).toBeGreaterThan(0);

      // Sequence numbers increase monotonically inside a room.
      const sequences = received.map((envelope) => envelope.seq);
      expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
    });

    it('never delivers another tenant’s events', async () => {
      const listener = connect(outsider.cookieHeader());
      await connected(listener);

      const received: AnyRealtimeEnvelope[] = [];
      listener.on(SERVER_EVENTS.event, (envelope: AnyRealtimeEnvelope) => received.push(envelope));

      // The outsider was refused the room, so nothing from it should ever arrive.
      await subscribe(listener, 'board', tenant.boardId);

      const todo = tenant.columns.find((column) => column.name === 'To Do')!;
      await insider
        .post(`/workspaces/${tenant.workspaceId}/tasks`, { columnId: todo.id, title: 'Private' })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(received.filter((envelope) => envelope.room.includes(tenant.boardId))).toHaveLength(0);
    });

    it('does not echo an event back to the socket that caused it', async () => {
      const socket = connect(insider.cookieHeader());
      await connected(socket);
      await subscribe(socket, 'board', tenant.boardId);

      const received: AnyRealtimeEnvelope[] = [];
      socket.on(SERVER_EVENTS.event, (envelope: AnyRealtimeEnvelope) => received.push(envelope));

      const todo = tenant.columns.find((column) => column.name === 'To Do')!;

      // The mutating client identifies its socket, exactly as the web app does.
      await insider
        .post(`/workspaces/${tenant.workspaceId}/tasks`, { columnId: todo.id, title: 'No echo' })
        .set('x-socket-id', socket.id ?? '')
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(received.filter((envelope) => envelope.type === 'task.created')).toHaveLength(0);
    });
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 6_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for a realtime event');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
