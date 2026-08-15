import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { CONFIG_TOKEN, type AppConfig } from '../config/env';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the caller may retry. Zero when the request was allowed. */
  retryAfterMs: number;
}

export interface PresenceEntry {
  userId: string;
  lastSeenMs: number;
}

/**
 * Thin facade over the four jobs Redis actually does here:
 *   1. monotonic per-room realtime sequence numbers,
 *   2. presence sets with heartbeat expiry,
 *   3. sliding-window rate limiting,
 *   4. pub/sub clients for the Socket.IO adapter.
 *
 * When `REDIS_ENABLED=false` every operation falls back to an in-process
 * implementation with identical semantics, so unit tests and a single-instance
 * `npm run dev` need no broker. The fallback is explicitly single-instance only.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private subscriber: Redis | null = null;

  private readonly memoryCounters = new Map<string, number>();
  private readonly memoryPresence = new Map<string, Map<string, number>>();
  private readonly memoryWindows = new Map<string, number[]>();
  private readonly memoryValues = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(@Inject(CONFIG_TOKEN) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.REDIS_ENABLED;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Redis disabled — using in-process fallbacks (single instance only)');
      return;
    }

    this.client = this.createClient('primary');
    this.subscriber = this.createClient('subscriber');
    this.logger.log('Redis connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client?.quit(), this.subscriber?.quit()].filter(Boolean));
  }

  private createClient(role: string): Redis {
    const client = new Redis(this.config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 3_000),
    });
    client.on('error', (error: Error) => {
      this.logger.error(`Redis ${role} client error: ${error.message}`);
    });
    return client;
  }

  /** Duplicated clients for `@socket.io/redis-adapter`; null when Redis is disabled. */
  duplicateForAdapter(): { pubClient: Redis; subClient: Redis } | null {
    if (!this.client || !this.subscriber) return null;
    return { pubClient: this.client.duplicate(), subClient: this.subscriber.duplicate() };
  }

  // -------------------------------------------------------------------------
  // Realtime sequencing
  // -------------------------------------------------------------------------

  async nextSequence(room: string): Promise<number> {
    const key = `realtime:seq:${room}`;
    if (this.client) return this.client.incr(key);

    const next = (this.memoryCounters.get(key) ?? 0) + 1;
    this.memoryCounters.set(key, next);
    return next;
  }

  async currentSequence(room: string): Promise<number> {
    const key = `realtime:seq:${room}`;
    if (this.client) {
      const value = await this.client.get(key);
      return value ? Number.parseInt(value, 10) : 0;
    }
    return this.memoryCounters.get(key) ?? 0;
  }

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  async touchPresence(room: string, userId: string, ttlMs: number): Promise<void> {
    const key = `presence:${room}`;
    const now = Date.now();

    if (this.client) {
      await this.client
        .multi()
        .zadd(key, now, userId)
        .zremrangebyscore(key, 0, now - ttlMs)
        .pexpire(key, ttlMs * 2)
        .exec();
      return;
    }

    const entries = this.memoryPresence.get(key) ?? new Map<string, number>();
    entries.set(userId, now);
    for (const [entryUserId, seenAt] of entries) {
      if (seenAt < now - ttlMs) entries.delete(entryUserId);
    }
    this.memoryPresence.set(key, entries);
  }

  async listPresence(room: string, ttlMs: number): Promise<PresenceEntry[]> {
    const key = `presence:${room}`;
    const cutoff = Date.now() - ttlMs;

    if (this.client) {
      await this.client.zremrangebyscore(key, 0, cutoff);
      const raw = await this.client.zrange(key, 0, -1, 'WITHSCORES');
      const entries: PresenceEntry[] = [];
      for (let index = 0; index < raw.length; index += 2) {
        const userId = raw[index];
        const score = raw[index + 1];
        if (userId && score) entries.push({ userId, lastSeenMs: Number.parseInt(score, 10) });
      }
      return entries;
    }

    const entries = this.memoryPresence.get(key);
    if (!entries) return [];
    const result: PresenceEntry[] = [];
    for (const [userId, seenAt] of entries) {
      if (seenAt < cutoff) entries.delete(userId);
      else result.push({ userId, lastSeenMs: seenAt });
    }
    return result;
  }

  async removePresence(room: string, userId: string): Promise<void> {
    const key = `presence:${room}`;
    if (this.client) {
      await this.client.zrem(key, userId);
      return;
    }
    this.memoryPresence.get(key)?.delete(userId);
  }

  // -------------------------------------------------------------------------
  // Rate limiting (sliding window)
  // -------------------------------------------------------------------------

  async consumeRateLimit(bucket: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!this.config.RATE_LIMIT_ENABLED) {
      return { allowed: true, remaining: limit, retryAfterMs: 0 };
    }

    const key = `ratelimit:${bucket}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (this.client) {
      const results = await this.client
        .multi()
        .zremrangebyscore(key, 0, windowStart)
        .zcard(key)
        .pexpire(key, windowMs)
        .exec();

      const used = Number(results?.[1]?.[1] ?? 0);
      if (used >= limit) {
        const oldest = await this.client.zrange(key, 0, 0, 'WITHSCORES');
        const oldestScore = oldest[1] ? Number.parseInt(oldest[1], 10) : now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, oldestScore + windowMs - now),
        };
      }

      // A unique member per hit so repeated hits inside the same millisecond all count.
      await this.client.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 10)}`);
      return { allowed: true, remaining: limit - used - 1, retryAfterMs: 0 };
    }

    const hits = (this.memoryWindows.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
    if (hits.length >= limit) {
      this.memoryWindows.set(key, hits);
      const oldest = hits[0] ?? now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + windowMs - now) };
    }
    hits.push(now);
    this.memoryWindows.set(key, hits);
    return { allowed: true, remaining: limit - hits.length, retryAfterMs: 0 };
  }

  async resetRateLimit(bucket: string): Promise<void> {
    const key = `ratelimit:${bucket}`;
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memoryWindows.delete(key);
  }

  // -------------------------------------------------------------------------
  // Generic key/value (short-lived coordination flags)
  // -------------------------------------------------------------------------

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    const entry = this.memoryValues.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.memoryValues.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (this.client) {
      if (ttlMs) await this.client.set(key, value, 'PX', ttlMs);
      else await this.client.set(key, value);
      return;
    }
    this.memoryValues.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
  }

  /** Sets the key only if absent. Returns true when this caller won the race. */
  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.client) {
      const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');
      return result === 'OK';
    }
    const existing = await this.get(key);
    if (existing !== null) return false;
    this.memoryValues.set(key, { value, expiresAt: Date.now() + ttlMs });
    return true;
  }

  async del(key: string): Promise<void> {
    if (this.client) {
      await this.client.del(key);
      return;
    }
    this.memoryValues.delete(key);
  }

  async ping(): Promise<boolean> {
    if (!this.client) return true;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
