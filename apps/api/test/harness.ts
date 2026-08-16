import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { COOKIE_NAMES, CSRF_HEADER } from '@flowsync/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration harness.
 *
 * Tests run against a real Postgres schema — Prisma is never mocked. Mocking the
 * ORM would only prove the mock behaves; the things worth testing here (tenant
 * isolation, cascade deletes, unique constraints, transaction behaviour) only
 * exist in the database.
 */
export class TestHarness {
  app!: INestApplication;
  prisma!: PrismaService;

  async start(): Promise<void> {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = requireEnv('DATABASE_URL_TEST');
    process.env.JWT_SECRET ??= 'test-secret-that-is-definitely-long-enough-32';
    process.env.REDIS_ENABLED = 'false';
    process.env.LOG_LEVEL = 'silent';
    process.env.RATE_LIMIT_ENABLED ??= 'true';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    this.app = moduleRef.createNestApplication({ logger: false });
    this.app.use(cookieParser());
    this.app.useGlobalFilters(new AllExceptionsFilter());
    await this.app.init();

    this.prisma = this.app.get(PrismaService);
  }

  /**
   * Binds the app to an ephemeral port and returns its base URL.
   * Socket.IO tests need a real listening server, which `app.init()` alone does
   * not provide.
   */
  async listen(): Promise<string> {
    await this.app.listen(0, '127.0.0.1');
    return (await this.app.getUrl()).replace('[::1]', '127.0.0.1');
  }

  async stop(): Promise<void> {
    await this.app?.close();
  }

  async reset(): Promise<void> {
    await this.prisma.truncateAll();
  }

  get server(): App {
    return this.app.getHttpServer() as App;
  }

  /** Creates an account and returns a client that carries its session. */
  async signUp(name: string, email: string, password = 'IntegrationTest42'): Promise<TestClient> {
    const client = new TestClient(this.server);
    await client.post('/auth/sign-up', { name, email, password }).expect(201);
    return client;
  }
}

/**
 * A signed-in HTTP client.
 *
 * It stores cookies exactly like a browser would and echoes the CSRF cookie in the
 * header on every state-changing request, so the tests exercise the real
 * double-submit flow rather than bypassing it.
 */
export class TestClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly server: App) {}

  get userId(): string | undefined {
    return this.cachedUserId;
  }

  private cachedUserId?: string;

  setUserId(userId: string): void {
    this.cachedUserId = userId;
  }

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  csrfToken(): string | undefined {
    return this.cookies.get(COOKIE_NAMES.csrf);
  }

  clearCookie(name: string): void {
    this.cookies.delete(name);
  }

  private capture(response: request.Response): void {
    const raw = response.headers['set-cookie'];
    if (!raw) return;
    for (const cookie of Array.isArray(raw) ? raw : [raw]) {
      const [pair] = cookie.split(';');
      if (!pair) continue;
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private wrap(test: request.Test, withCsrf: boolean): request.Test {
    if (this.cookies.size > 0) test.set('Cookie', this.cookieHeader());
    const csrf = this.csrfToken();
    if (withCsrf && csrf) test.set(CSRF_HEADER, csrf);

    // supertest returns a thenable; capture cookies as the response lands.
    const originalThen = test.then.bind(test);
    test.then = ((onFulfilled?: never, onRejected?: never) =>
      originalThen((response: request.Response) => {
        this.capture(response);
        return onFulfilled ? (onFulfilled as (r: request.Response) => unknown)(response) : response;
      }, onRejected)) as typeof test.then;

    return test;
  }

  get(path: string): request.Test {
    return this.wrap(request(this.server).get(path), false);
  }

  post(path: string, body?: unknown): request.Test {
    const test = request(this.server).post(path);
    if (body !== undefined) test.send(body as object);
    return this.wrap(test, true);
  }

  patch(path: string, body?: unknown): request.Test {
    const test = request(this.server).patch(path);
    if (body !== undefined) test.send(body as object);
    return this.wrap(test, true);
  }

  delete(path: string): request.Test {
    return this.wrap(request(this.server).delete(path), true);
  }

  /** Deliberately omits the CSRF header, for the negative case. */
  postWithoutCsrf(path: string, body?: unknown): request.Test {
    const test = request(this.server).post(path);
    if (body !== undefined) test.send(body as object);
    return this.wrap(test, false);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and run "npm run db:test:setup -w @flowsync/api".`,
    );
  }
  return value;
}

/** Convenience: a workspace with a project, board and columns, ready to use. */
export async function seedWorkspace(
  client: TestClient,
  name = 'Test Workspace',
): Promise<{
  workspaceId: string;
  projectId: string;
  boardId: string;
  columns: Array<{ id: string; name: string; isDone: boolean }>;
}> {
  const workspace = await client.post('/workspaces', { name }).expect(201);
  const workspaceId = workspace.body.id as string;

  const project = await client
    .post(`/workspaces/${workspaceId}/projects`, { name: 'Test Project', key: 'TEST' })
    .expect(201);
  const projectId = project.body.id as string;

  const detail = await client.get(`/workspaces/${workspaceId}/projects/${projectId}`).expect(200);
  const boardId = detail.body.boards[0].id as string;

  const board = await client.get(`/workspaces/${workspaceId}/boards/${boardId}`).expect(200);

  return { workspaceId, projectId, boardId, columns: board.body.columns };
}
