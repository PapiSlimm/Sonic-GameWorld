// Live RTS lobby/match config (docs/RTS-CONTRACTS.md §5). Mirrors sessionStore.ts's role exactly,
// one layer up: `GameSession`/`GameSessionPlayer` (Postgres) remain the durable source of truth for
// session membership, while this store holds the RTS-specific bits that have no Postgres column
// and don't need one — the match seed, per-faction human/AI assignment, and who has readied up.
// Redis-backed when `REDIS_URL` is actually configured, an in-memory Map otherwise (dev/tests),
// exactly like `sessionStore.ts`. This package never runs `rts-sim`'s simulation (§5: "the API
// only relays/manages lobbies") — it only mints the seed + faction roster every peer needs to call
// `createMatch()` identically.
import type { Redis } from 'ioredis';

export type RtsDifficulty = 'Beginner' | 'Intermediate' | 'Pro';

export interface RtsSessionRecord {
  sessionId: string;
  gameId: string;
  seed: number;
  mapWidthM: number;
  mapDepthM: number;
  cellSizeM: number;
  /** Accepted and stored now per docs/RTS-CONTRACTS.md §9, even though `commanderAI` doesn't yet
   * branch on it — §9's difficulty-driven AI behavior lands in a later, additive pass. */
  difficulty: RtsDifficulty;
  /** factionId (one of RTS_FACTIONS[].id) -> controlling userId, or null when AI-controlled. */
  factionAssignments: Record<string, string | null>;
  /** userIds (must each hold a faction) who have confirmed ready in the lobby screen. */
  readyUserIds: string[];
  updatedAt: string;
}

export interface RtsSessionStore {
  get(sessionId: string): Promise<RtsSessionRecord | null>;
  set(sessionId: string, record: RtsSessionRecord): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

class MemoryRtsSessionStore implements RtsSessionStore {
  private readonly map = new Map<string, RtsSessionRecord>();
  // eslint-disable-next-line @typescript-eslint/require-await
  async get(id: string): Promise<RtsSessionRecord | null> {
    return this.map.get(id) ?? null;
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async set(id: string, record: RtsSessionRecord): Promise<void> {
    this.map.set(id, record);
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async delete(id: string): Promise<void> {
    this.map.delete(id);
  }
}

const RTS_SESSION_TTL_SECONDS = 6 * 60 * 60;

class RedisRtsSessionStore implements RtsSessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'gw:rts-session:',
    private readonly ttlSeconds = RTS_SESSION_TTL_SECONDS,
  ) {}
  private key(id: string): string {
    return `${this.prefix}${id}`;
  }
  async get(id: string): Promise<RtsSessionRecord | null> {
    const raw = await this.redis.get(this.key(id));
    return raw ? (JSON.parse(raw) as RtsSessionRecord) : null;
  }
  async set(id: string, record: RtsSessionRecord): Promise<void> {
    await this.redis.set(this.key(id), JSON.stringify(record), 'EX', this.ttlSeconds);
  }
  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }
}

/** Same "REDIS_URL unset -> in-memory map" convention as sessionStore.ts's createSessionStore. */
export function createRtsSessionStore(redis: Redis | undefined): RtsSessionStore {
  if (process.env.REDIS_URL && redis) return new RedisRtsSessionStore(redis);
  return new MemoryRtsSessionStore();
}
