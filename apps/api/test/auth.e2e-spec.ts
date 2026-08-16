import { COOKIE_NAMES } from '@flowsync/shared';
import request from 'supertest';
import { TestClient, TestHarness } from './harness';

describe('authentication', () => {
  const harness = new TestHarness();

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.stop();
  });

  describe('sign up', () => {
    it('creates an account and starts a session', async () => {
      const client = new TestClient(harness.server);
      const response = await client
        .post('/auth/sign-up', {
          name: 'Emma Carter',
          email: 'emma@flowsync.test',
          password: 'CorrectHorse42',
        })
        .expect(201);

      expect(response.body).toMatchObject({ name: 'Emma Carter', email: 'emma@flowsync.test' });
      expect(response.body).not.toHaveProperty('passwordHash');

      const cookies = (response.headers['set-cookie'] as unknown as string[]) ?? [];
      const access = cookies.find((cookie) => cookie.startsWith(COOKIE_NAMES.accessToken));
      const refresh = cookies.find((cookie) => cookie.startsWith(COOKIE_NAMES.refreshToken));
      const csrf = cookies.find((cookie) => cookie.startsWith(COOKIE_NAMES.csrf));

      expect(access).toContain('HttpOnly');
      expect(refresh).toContain('HttpOnly');
      // The CSRF cookie must be readable by JavaScript — that is the whole point
      // of the double-submit pattern.
      expect(csrf).toBeDefined();
      expect(csrf).not.toContain('HttpOnly');
    });

    it('stores the password hashed, never in plain text', async () => {
      await harness.signUp('Hash Check', 'hash@flowsync.test', 'CorrectHorse42');

      const user = await harness.prisma.user.findUniqueOrThrow({
        where: { email: 'hash@flowsync.test' },
        select: { passwordHash: true },
      });

      expect(user.passwordHash).not.toContain('CorrectHorse42');
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    });

    it('rejects a duplicate email', async () => {
      await harness.signUp('First', 'dupe@flowsync.test');
      const client = new TestClient(harness.server);

      const response = await client
        .post('/auth/sign-up', {
          name: 'Second',
          email: 'dupe@flowsync.test',
          password: 'CorrectHorse42',
        })
        .expect(409);

      expect(response.body.code).toBe('EMAIL_TAKEN');
    });

    it('rejects weak and breached passwords', async () => {
      const client = new TestClient(harness.server);

      const short = await client
        .post('/auth/sign-up', { name: 'A', email: 'a@flowsync.test', password: 'short1' })
        .expect(400);
      expect(short.body.code).toBe('VALIDATION_FAILED');

      const breached = await client
        .post('/auth/sign-up', { name: 'B', email: 'b@flowsync.test', password: 'password123' })
        .expect(400);
      expect(breached.body.details?.[0]?.message).toMatch(/breach/i);

      const noDigits = await client
        .post('/auth/sign-up', { name: 'C', email: 'c@flowsync.test', password: 'onlyletters' })
        .expect(400);
      expect(noDigits.body.code).toBe('VALIDATION_FAILED');
    });

    it('strips unknown fields instead of trusting them', async () => {
      const client = new TestClient(harness.server);
      await client
        .post('/auth/sign-up', {
          name: 'Sneaky',
          email: 'sneaky@flowsync.test',
          password: 'CorrectHorse42',
          role: 'OWNER',
          id: 'chosen-by-client',
        })
        .expect(400);
    });
  });

  describe('sign in', () => {
    beforeEach(async () => {
      await harness.signUp('Emma Carter', 'emma@flowsync.test', 'CorrectHorse42');
    });

    it('accepts the right password', async () => {
      const client = new TestClient(harness.server);
      await client
        .post('/auth/sign-in', { email: 'emma@flowsync.test', password: 'CorrectHorse42' })
        .expect(200);
    });

    it('gives the same answer for a wrong password and an unknown account', async () => {
      const client = new TestClient(harness.server);

      const wrongPassword = await client
        .post('/auth/sign-in', { email: 'emma@flowsync.test', password: 'WrongPassword99' })
        .expect(401);

      const unknownEmail = await client
        .post('/auth/sign-in', { email: 'nobody@flowsync.test', password: 'WrongPassword99' })
        .expect(401);

      // Identical responses: no user-enumeration oracle.
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.body.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('sessions', () => {
    it('rejects an unauthenticated request with a structured error', async () => {
      const response = await request(harness.server).get('/auth/me').expect(401);

      expect(response.body.code).toBe('UNAUTHENTICATED');
      expect(typeof response.body.requestId).toBe('string');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('rotates the refresh token and revokes the family when one is replayed', async () => {
      const client = await harness.signUp('Rotate', 'rotate@flowsync.test');
      const firstRefresh = extractCookie(client, COOKIE_NAMES.refreshToken);

      await client.post('/auth/refresh').expect(200);
      const secondRefresh = extractCookie(client, COOKIE_NAMES.refreshToken);
      expect(secondRefresh).not.toBe(firstRefresh);

      // Replaying the consumed token looks like theft, so the family is revoked.
      await request(harness.server)
        .post('/auth/refresh')
        .set('Cookie', `${COOKIE_NAMES.refreshToken}=${firstRefresh}`)
        .expect(401);

      await client.post('/auth/refresh').expect(401);
    });

    it('signs out and invalidates the session', async () => {
      const client = await harness.signUp('Bye', 'bye@flowsync.test');
      await client.get('/auth/me').expect(200);

      await client.post('/auth/sign-out').expect(204);
      await client.post('/auth/refresh').expect(401);
    });

    it('revokes every session when the password changes', async () => {
      const client = await harness.signUp('Change', 'change@flowsync.test', 'CorrectHorse42');

      await client
        .post('/auth/change-password', {
          currentPassword: 'CorrectHorse42',
          newPassword: 'BrandNewSecret77',
        })
        .expect(204);

      await client.post('/auth/refresh').expect(401);

      const fresh = new TestClient(harness.server);
      await fresh
        .post('/auth/sign-in', { email: 'change@flowsync.test', password: 'BrandNewSecret77' })
        .expect(200);
    });
  });

  describe('CSRF', () => {
    it('rejects a state-changing request without the header', async () => {
      const client = await harness.signUp('Csrf', 'csrf@flowsync.test');

      const response = await client.postWithoutCsrf('/workspaces', { name: 'No CSRF' });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_FAILED');
    });

    it('rejects a header that does not match the cookie', async () => {
      const client = await harness.signUp('Mismatch', 'mismatch@flowsync.test');

      await request(harness.server)
        .post('/workspaces')
        .set('Cookie', client.cookieHeader())
        .set('x-csrf-token', 'a-different-token-entirely')
        .send({ name: 'Forged' })
        .expect(403);
    });

    it('allows the request when the header matches', async () => {
      const client = await harness.signUp('Valid', 'valid@flowsync.test');
      await client.post('/workspaces', { name: 'Legitimate' }).expect(201);
    });

    it('does not require CSRF for reads', async () => {
      const client = await harness.signUp('Reader', 'reader@flowsync.test');
      await client.get('/auth/me').expect(200);
    });
  });

  describe('password reset', () => {
    it('always answers the same way, then accepts a valid token', async () => {
      await harness.signUp('Reset', 'reset@flowsync.test', 'CorrectHorse42');
      const client = new TestClient(harness.server);

      // Unknown address: still 202, so the endpoint is not an account oracle.
      await client.post('/auth/forgot-password', { email: 'nobody@flowsync.test' }).expect(202);
      await client.post('/auth/forgot-password', { email: 'reset@flowsync.test' }).expect(202);

      const stored = await harness.prisma.passwordResetToken.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { tokenHash: true, userId: true },
      });
      expect(stored).not.toBeNull();
      // Only the hash is persisted; the plaintext lives in the email alone.
      expect(stored?.tokenHash).toHaveLength(64);

      // The token itself is only visible through the mailer, which the console
      // transport records for exactly this purpose.
      const outbox = harness.app.get((await import('../src/mailer/mailer.service')).MailerService);
      const message = outbox.outbox().at(-1);
      const token = /token=([\w-]+)/.exec(message?.text ?? '')?.[1];
      expect(token).toBeDefined();

      await client.post('/auth/reset-password', { token, password: 'AnotherSecret88' }).expect(204);

      // Single use.
      await client.post('/auth/reset-password', { token, password: 'YetAnother99' }).expect(400);

      const fresh = new TestClient(harness.server);
      await fresh
        .post('/auth/sign-in', { email: 'reset@flowsync.test', password: 'AnotherSecret88' })
        .expect(200);
    });
  });
});

function extractCookie(client: TestClient, name: string): string | undefined {
  const match = new RegExp(`${name}=([^;]+)`).exec(client.cookieHeader());
  return match?.[1];
}
