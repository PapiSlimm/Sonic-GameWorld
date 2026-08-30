// Live game-session state (§9: sessions create/join/end). Postgres (`GameSession` /
// `GameSessionPlayer`) is always the durable source of truth; this store layers fast-changing
// live state (current player list, live status) on top of it — Redis-backed when `REDIS_URL` is
// actually configured, an in-memory Map otherwise (dev/tests). One store instance is created per
// app build (see ./index.ts), so tests never leak state across `buildTestApp()` calls.
import type { Redis } from 'ioredis';

export interface LiveSessionState {
  id: string;
  gameId: string;
  status: 'LOBBY' | 'RUNNING' | 'ENDED';
  players: string[];
  maxPlayers: number;
  mode?: string | null;
  region?: string | null;
  hostId?: string | null;
  serverId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  updatedAt: string;
}

export interface SessionStore {
  get(sessionId: string): Promise<LiveSessionState | null>;
  set(sessionId: string, state: LiveSessionState): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

class MemorySessionStore implements SessionStore {
  private readonly map = new Map<string, LiveSessionState>();
  // eslint-disable-next-line @typescript-eslint/require-await
  async get(id: string): Promise<LiveSessionState | null> {
    return this.map.get(id) ?? null;
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async set(id: string, state: LiveSessionState): Promise<void> {
    this.map.set(id, state);
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }
}

const SESSION_TTL_SECONDS = 6 * 60 * 60;

class RedisSessionStore implements SessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'gw:session:',
    private readonly ttlSeconds = SESSION_TTL_SECONDS,
  ) {}
  private key(id: string): string {
    return `${this.prefix}${id}`;
  }
  async get(id: string): Promise<LiveSessionState | null> {
    const raw = await this.redis.get(this.key(id));
    return raw ? (JSON.parse(raw) as LiveSessionState) : null;
  }
  async set(id: string, state: LiveSessionState): Promise<void> {
    await this.redis.set(this.key(id), JSON.stringify(state), 'EX', this.ttlSeconds);
  }
  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }
}

/** `REDIS_URL` unset -> in-memory map (dev/test default per docs/CONTRACTS.md §9's "fall back to
 * in-memory map when REDIS_URL unset"). Note: `app.config.redisUrl` always has a default, so this
 * checks the raw env var, matching the literal "unset" condition in the assignment. */
export function createSessionStore(redis: Redis | undefined): SessionStore {
  if (process.env.REDIS_URL && redis) return new RedisSessionStore(redis);
  return new MemorySessionStore();
}
