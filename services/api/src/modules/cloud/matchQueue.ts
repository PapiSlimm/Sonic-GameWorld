// FIFO matchmaking queue backing `POST /cloud/matchmake` (§9: "Redis-backed or in-memory queue ->
// GameServer allocation"). Tickets are queued under a `gameId:mode:region` key so only compatible
// players are ever popped together. Same `REDIS_URL` unset -> in-memory fallback convention as
// games/sessionStore.ts, so tests never touch a real Redis instance.
import type { Redis } from 'ioredis';

export interface MatchQueue {
  /** Enqueue a ticket id under `key`. */
  push(key: string, ticketId: string): Promise<void>;
  /** Pop up to `count` ticket ids (FIFO) only if at least `count` are queued; otherwise pops
   * nothing and returns an empty array (the caller's own ticket stays queued). */
  popIfAtLeast(key: string, count: number): Promise<string[]>;
  /** Remove one ticket id from its queue (e.g. a cancelled ticket) — a no-op if not present. */
  remove(key: string, ticketId: string): Promise<void>;
  length(key: string): Promise<number>;
}

class MemoryMatchQueue implements MatchQueue {
  private readonly queues = new Map<string, string[]>();

  private list(key: string): string[] {
    let list = this.queues.get(key);
    if (!list) {
      list = [];
      this.queues.set(key, list);
    }
    return list;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async push(key: string, ticketId: string): Promise<void> {
    this.list(key).push(ticketId);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async popIfAtLeast(key: string, count: number): Promise<string[]> {
    const list = this.list(key);
    if (list.length < count) return [];
    return list.splice(0, count);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(key: string, ticketId: string): Promise<void> {
    const list = this.list(key);
    const idx = list.indexOf(ticketId);
    if (idx !== -1) list.splice(idx, 1);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async length(key: string): Promise<number> {
    return this.list(key).length;
  }
}

const QUEUE_PREFIX = 'gw:matchqueue:';

class RedisMatchQueue implements MatchQueue {
  constructor(private readonly redis: Redis) {}

  private key(k: string): string {
    return `${QUEUE_PREFIX}${k}`;
  }

  async push(key: string, ticketId: string): Promise<void> {
    await this.redis.rpush(this.key(key), ticketId);
  }

  async popIfAtLeast(key: string, count: number): Promise<string[]> {
    const len = await this.redis.llen(this.key(key));
    if (len < count) return [];
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop -- bounded by `count`, small party sizes
      const value = await this.redis.lpop(this.key(key));
      if (value) out.push(value);
    }
    return out;
  }

  async remove(key: string, ticketId: string): Promise<void> {
    await this.redis.lrem(this.key(key), 0, ticketId);
  }

  async length(key: string): Promise<number> {
    return this.redis.llen(this.key(key));
  }
}

/** `REDIS_URL` unset -> in-memory queue (dev/test default), matching the literal condition used
 * by games/sessionStore.ts's `createSessionStore`. */
export function createMatchQueue(redis: Redis | undefined): MatchQueue {
  if (process.env.REDIS_URL && redis) return new RedisMatchQueue(redis);
  return new MemoryMatchQueue();
}
