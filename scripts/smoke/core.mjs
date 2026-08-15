#!/usr/bin/env node
/**
 * Exploratory end-to-end smoke check against a running API.
 *
 * Not a replacement for the committed test suites — this is the script used while
 * building the backend to prove the behaviours that matter most (two-user realtime,
 * tenant isolation, RBAC, concurrent ranking) against real Postgres and Redis.
 *
 * Usage: seed the database, start the API, then `node scripts/smoke/core.mjs`.
 */
import { io } from 'socket.io-client';

const BASE = 'http://localhost:4000';
const results = [];
function check(name, condition, detail) {
  results.push({ name, pass: !!condition, detail });
}

class Client {
  constructor(label) {
    this.label = label;
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  apply(res) {
    for (const cookie of res.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(';');
      const i = pair.indexOf('=');
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async call(method, path, body, extra = {}) {
    const headers = { ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.jar.size) headers.Cookie = this.cookieHeader();
    if (this.jar.has('fs_csrf') && method !== 'GET') headers['X-CSRF-Token'] = this.jar.get('fs_csrf');
    if (this.socketId) headers['X-Socket-Id'] = this.socketId;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.apply(res);
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }
  async signIn(email, password = 'DemoFlow2024!') {
    const r = await this.call('POST', '/auth/sign-in', { email, password });
    if (r.status !== 200) throw new Error(`${this.label} sign-in failed: ${JSON.stringify(r.body)}`);
    return r.body;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(BASE, {
        path: '/realtime',
        transports: ['websocket'],
        extraHeaders: { Cookie: this.cookieHeader(), Origin: 'http://localhost:3100' },
      });
      this.events = [];
      this.socket.on('event', (envelope) => this.events.push(envelope));
      this.socket.on('connect', () => {
        this.socketId = this.socket.id;
        resolve();
      });
      this.socket.on('connect_error', reject);
      setTimeout(() => reject(new Error(`${this.label} socket connect timeout`)), 8000);
    });
  }
  subscribe(scope, id) {
    return new Promise((resolve) => this.socket.emit('subscribe', { scope, id }, resolve));
  }
  waitFor(type, timeoutMs = 5000) {
    return new Promise((resolve) => {
      const existing = this.events.find((e) => e.type === type);
      if (existing) return resolve(existing);
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const handler = (envelope) => {
        if (envelope.type === type) {
          clearTimeout(timer);
          this.socket.off('event', handler);
          resolve(envelope);
        }
      };
      this.socket.on('event', handler);
    });
  }
}

// --- Sign in -----------------------------------------------------------------
const emma = new Client('emma');
const daniel = new Client('daniel');
const noah = new Client('noah');

const emmaUser = await emma.signIn('emma.carter@northstarlabs.io');
await daniel.signIn('daniel.kim@northstarlabs.io');
await noah.signIn('noah.bennett@contractor.dev');
check('demo accounts sign in', !!emmaUser.id, emmaUser.email);

// --- Workspace and board -----------------------------------------------------
let r = await emma.call('GET', '/workspaces');
const workspace = r.body?.[0];
check('workspace list returns Northstar Labs', workspace?.name === 'Northstar Labs', r.body);
check('owner role resolved', workspace?.role === 'OWNER', workspace?.role);
const ws = workspace.id;

r = await emma.call('GET', `/workspaces/${ws}/projects`);
const projects = r.body;
check('four demo projects', projects?.length === 4, projects?.map((p) => p.key));

const web = projects.find((p) => p.key === 'WEB');
r = await emma.call('GET', `/workspaces/${ws}/projects/${web.id}`);
const boardId = r.body?.boards?.[0]?.id;
check('project detail exposes a board', !!boardId, r.body?.boards);

r = await emma.call('GET', `/workspaces/${ws}/boards/${boardId}`);
const snapshot = r.body;
check('board snapshot has 5 columns', snapshot?.columns?.length === 5, snapshot?.columns?.length);
check('board snapshot has tasks', snapshot?.tasks?.length === 7, snapshot?.tasks?.length);
check('snapshot carries a realtime seq', typeof snapshot?.seq === 'number', snapshot?.seq);
check(
  'tasks carry readable keys',
  snapshot.tasks.every((t) => /^WEB-\d+$/.test(t.key)),
  snapshot.tasks.map((t) => t.key),
);
check(
  'subtask progress is computed',
  snapshot.tasks.some((t) => t.subtaskCount > 0 && t.completedSubtaskCount > 0),
  snapshot.tasks.map((t) => `${t.completedSubtaskCount}/${t.subtaskCount}`),
);

// --- Realtime: two users, one board -----------------------------------------
await emma.connect();
await daniel.connect();
const ackEmma = await emma.subscribe('board', boardId);
const ackDaniel = await daniel.subscribe('board', boardId);
check('emma subscribed to the board room', ackEmma?.room === `board:${boardId}`, ackEmma);
check('daniel subscribed to the board room', ackDaniel?.room === `board:${boardId}`, ackDaniel);

const todo = snapshot.columns.find((c) => c.name === 'To Do');
const inProgress = snapshot.columns.find((c) => c.name === 'In Progress');
const movable = snapshot.tasks.find((t) => t.columnId === todo.id);

const danielMoved = daniel.waitFor('task.moved');
const emmaEchoCount = emma.events.length;

r = await emma.call('PATCH', `/workspaces/${ws}/tasks/${movable.id}/move`, {
  columnId: inProgress.id,
  beforeTaskId: null,
  afterTaskId: null,
});
check('move returns 200', r.status === 200, r.body);
check('move persisted the new column', r.body?.columnId === inProgress.id, r.body?.columnId);

const moveEvent = await danielMoved;
check('THE HEADLINE TEST: user B receives task.moved', moveEvent !== null, 'timed out');
check(
  'event payload carries the moved task',
  moveEvent?.payload?.task?.id === movable.id,
  moveEvent?.payload?.task?.id,
);
check(
  'event names both columns',
  moveEvent?.payload?.fromColumnId === todo.id && moveEvent?.payload?.toColumnId === inProgress.id,
  moveEvent?.payload,
);
check('event has a monotonic seq', typeof moveEvent?.seq === 'number' && moveEvent.seq > 0, moveEvent?.seq);
check('event has a dedupe id', typeof moveEvent?.id === 'string', moveEvent?.id);

await new Promise((resolve) => setTimeout(resolve, 400));
check(
  'origin socket does not receive its own echo',
  emma.events.length === emmaEchoCount,
  `${emmaEchoCount} -> ${emma.events.length}`,
);

// --- Realtime: comment + mention notification --------------------------------
const danielComment = daniel.waitFor('comment.created');
r = await emma.call('POST', `/workspaces/${ws}/tasks/${movable.id}/comments`, {
  body: `Picking this up now. @[Daniel Kim](${(await daniel.call('GET', '/auth/me')).body.id}) can you review after?`,
  mentionedUserIds: [],
});
check('comment created', r.status === 201, r.body);
const commentEvent = await danielComment;
check('user B receives comment.created live', commentEvent !== null, 'timed out');

r = await daniel.call('GET', `/workspaces/${ws}/notifications?unreadOnly=true`);
check(
  'mention produced a notification',
  r.body?.items?.some((n) => n.type === 'MENTION'),
  r.body?.items?.map((n) => n.type),
);

// --- RBAC --------------------------------------------------------------------
// Noah is a guest on the LAUNCH project only, so use a column he can actually see:
// a 404 there would prove nothing about RBAC, only about visibility.
const launch = projects.find((p) => p.key === 'LAUNCH');
const launchDetail = (await emma.call('GET', `/workspaces/${ws}/projects/${launch.id}`)).body;
const launchBoard = (
  await emma.call('GET', `/workspaces/${ws}/boards/${launchDetail.boards[0].id}`)
).body;
const launchTodo = launchBoard.columns.find((c) => c.name === 'To Do');

r = await noah.call('GET', `/workspaces/${ws}/boards/${launchDetail.boards[0].id}`);
check('guest can read the board they belong to', r.status === 200, r.status);

r = await noah.call('POST', `/workspaces/${ws}/tasks`, {
  columnId: launchTodo.id,
  title: 'Guest should not be able to create this',
});
check('guest cannot create a task on a board they can see', r.status === 403, `${r.status} ${r.body?.code}`);

r = await noah.call('POST', `/workspaces/${ws}/tasks/${launchBoard.tasks[0].id}/comments`, {
  body: 'Guests are allowed to comment.',
  mentionedUserIds: [],
});
check('guest can comment', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);

r = await noah.call('POST', `/workspaces/${ws}/tasks`, {
  columnId: todo.id,
  title: 'Guest cannot even see this column',
});
check('guest gets 404 for a project they are not on', r.status === 404, r.status);

r = await noah.call('POST', `/workspaces/${ws}/projects`, { name: 'Nope', key: 'NOPE' });
check('guest cannot create a project', r.status === 403, r.status);

r = await daniel.call('DELETE', `/workspaces/${ws}`);
check('admin cannot delete the workspace', r.status === 403, r.status);

// Guests can comment.
r = await noah.call('GET', `/workspaces/${ws}/projects`);
const guestProjects = r.body;
check('guest only sees assigned projects', guestProjects?.length === 1, guestProjects?.map((p) => p.key));

// --- Tenant isolation --------------------------------------------------------
const outsider = new Client('outsider');
const outsiderEmail = `outsider-${Date.now()}@flowsync.test`;
await outsider.call('POST', '/auth/sign-up', {
  name: 'Outsider Person',
  email: outsiderEmail,
  password: 'SeparateTenant42',
});

const isolationChecks = [
  ['GET', `/workspaces/${ws}`],
  ['GET', `/workspaces/${ws}/projects`],
  ['GET', `/workspaces/${ws}/boards/${boardId}`],
  ['GET', `/workspaces/${ws}/tasks/${movable.id}`],
  ['GET', `/workspaces/${ws}/members`],
  ['GET', `/workspaces/${ws}/activity`],
  ['GET', `/workspaces/${ws}/notifications`],
  ['GET', `/workspaces/${ws}/search?q=pricing`],
  ['PATCH', `/workspaces/${ws}/tasks/${movable.id}`],
];
let isolated = true;
const leaks = [];
for (const [method, path] of isolationChecks) {
  const res = await outsider.call(method, path, method === 'PATCH' ? { title: 'hacked' } : undefined);
  if (res.status !== 404) {
    isolated = false;
    leaks.push(`${method} ${path} -> ${res.status}`);
  }
}
check('every cross-tenant read/write returns 404', isolated, leaks);

// Cross-tenant socket subscription.
await outsider.connect();
const outsiderAck = await outsider.subscribe('board', boardId);
check('cross-tenant socket subscription refused', outsiderAck?.code === 'NOT_FOUND', outsiderAck);

// --- Ranking under concurrency ----------------------------------------------
const column = inProgress.id;
const created = [];
for (let i = 0; i < 5; i++) {
  const res = await emma.call('POST', `/workspaces/${ws}/tasks`, {
    columnId: column,
    title: `Rank probe ${i}`,
  });
  created.push(res.body);
}
check('bulk create succeeded', created.every((t) => t?.id), created.map((t) => t?.key));

// Everyone drops onto the same slot at the same time.
const [a, b, c] = created;
const concurrent = await Promise.all([
  emma.call('PATCH', `/workspaces/${ws}/tasks/${a.id}/move`, {
    columnId: column,
    beforeTaskId: b.id,
    afterTaskId: c.id,
  }),
  daniel.call('PATCH', `/workspaces/${ws}/tasks/${created[3].id}/move`, {
    columnId: column,
    beforeTaskId: b.id,
    afterTaskId: c.id,
  }),
  emma.call('PATCH', `/workspaces/${ws}/tasks/${created[4].id}/move`, {
    columnId: column,
    beforeTaskId: b.id,
    afterTaskId: c.id,
  }),
]);
check(
  'concurrent drops onto the same slot all succeed',
  concurrent.every((res) => res.status === 200),
  concurrent.map((res) => res.status),
);
const ranks = concurrent.map((res) => res.body?.rank);
check('and produce distinct ranks', new Set(ranks).size === ranks.length, ranks);

// Cleanup the probes.
for (const task of created) {
  await emma.call('DELETE', `/workspaces/${ws}/tasks/${task.id}`);
}

// --- Search ------------------------------------------------------------------
r = await emma.call('GET', `/workspaces/${ws}/search?q=notification`);
check(
  'search finds tasks across projects',
  r.body?.tasks?.length > 0,
  r.body?.tasks?.map((t) => t.key),
);

r = await emma.call('GET', `/workspaces/${ws}/dashboard`);
check('dashboard returns assigned work and activity', Array.isArray(r.body?.recentActivity) && r.body.recentActivity.length > 0, {
  assigned: r.body?.assignedToMe?.length,
  activity: r.body?.recentActivity?.length,
});

emma.socket?.close();
daniel.socket?.close();
outsider.socket?.close();

const failed = results.filter((r) => !r.pass);
for (const result of results) {
  console.log(
    `${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.pass ? '' : ` -> ${JSON.stringify(result.detail)}`}`,
  );
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
