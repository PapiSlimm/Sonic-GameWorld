import { MemoryEventBus, type MemoryBusOptions } from './drivers/memory.js';
import { RedisEventBus, type RedisBusOptions } from './drivers/redis.js';
import { PubSubEventBus, type PubSubBusOptions } from './drivers/pubsub.js';
import { KafkaEventBus, type KafkaBusOptions } from './drivers/kafka.js';
import type { EventBus } from './types.js';

export * from './types.js';
export * from './core.js';
export { MemoryEventBus, RedisEventBus, PubSubEventBus, KafkaEventBus };
export type { MemoryBusOptions, RedisBusOptions, PubSubBusOptions, KafkaBusOptions };

export type EventBusDriver = 'memory' | 'redis' | 'pubsub' | 'kafka';

export type CreateEventBusOptions =
  | ({ driver: 'memory' } & MemoryBusOptions)
  | ({ driver: 'redis' } & RedisBusOptions)
  | ({ driver: 'pubsub' } & PubSubBusOptions)
  | ({ driver: 'kafka' } & KafkaBusOptions);

/**
 * Create an event bus. Only the `memory` and `redis` drivers load their dependencies eagerly;
 * `pubsub` and `kafka` import their SDKs lazily on first publish/subscribe.
 */
export function createEventBus(opts: CreateEventBusOptions): EventBus {
  switch (opts.driver) {
    case 'memory':
      return new MemoryEventBus(opts);
    case 'redis':
      return new RedisEventBus(opts);
    case 'pubsub':
      return new PubSubEventBus(opts);
    case 'kafka':
      return new KafkaEventBus(opts);
    default: {
      const d: never = opts;
      throw new Error(`Unknown event bus driver: ${String((d as { driver?: unknown }).driver)}`);
    }
  }
}

/** Resolve driver + options from environment (EVENT_BUS_DRIVER, REDIS_URL, GCP_PROJECT_ID, KAFKA_BROKERS). */
export function createEventBusFromEnv(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Record<string, unknown>> = {}): EventBus {
  const driver = (env['EVENT_BUS_DRIVER'] ?? 'memory') as EventBusDriver;
  switch (driver) {
    case 'redis':
      return createEventBus({ driver: 'redis', url: env['REDIS_URL'], ...(overrides as RedisBusOptions) });
    case 'pubsub':
      return createEventBus({ driver: 'pubsub', projectId: env['GCP_PROJECT_ID'], prefix: env['PUBSUB_TOPIC_PREFIX'], ...(overrides as PubSubBusOptions) });
    case 'kafka':
      return createEventBus({ driver: 'kafka', brokers: env['KAFKA_BROKERS']?.split(',').map((s) => s.trim()).filter(Boolean), ...(overrides as KafkaBusOptions) });
    case 'memory':
    default:
      return createEventBus({ driver: 'memory', ...(overrides as MemoryBusOptions) });
  }
}
