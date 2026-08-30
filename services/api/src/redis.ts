// ioredis client singleton. Used directly for caching/rate-limit style needs; BullMQ workers
// (outside this service) create their own connections from REDIS_URL.
import { Redis } from 'ioredis';
import { getConfig } from './config.js';

let client: Redis | undefined;

/** Lazily create (or return) the singleton ioredis client. Connects lazily; failures are logged, not thrown,
 * so the API can boot (and serve /health) even when Redis is briefly unavailable in dev. */
export function getRedis(): Redis {
  if (!client) {
    const config = getConfig();
    client = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] connection error:', err.message);
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = undefined;
  }
}

/** Best-effort ping used by the /ready health check; never throws. */
export async function pingRedis(timeoutMs = 1000): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs)),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  }
}
