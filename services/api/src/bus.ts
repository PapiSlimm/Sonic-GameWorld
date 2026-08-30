// Domain event bus wiring. Thin wrapper over @sonic-gameworld/events that resolves the driver +
// connection options from AppConfig (see docs/CONTRACTS.md §7).
import { createEventBus, type EventBus } from '@sonic-gameworld/events';
import type { AppConfig } from './config.js';

let bus: EventBus | undefined;

/** Build a fresh EventBus from config. Most call sites should use getBus()/setBusForTests() instead. */
export function createEventBusFromConfig(config: AppConfig): EventBus {
  switch (config.eventBus.driver) {
    case 'redis':
      return createEventBus({ driver: 'redis', url: config.redisUrl });
    case 'pubsub':
      return createEventBus({ driver: 'pubsub', projectId: config.eventBus.gcpProjectId, prefix: config.eventBus.pubsubTopicPrefix });
    case 'kafka':
      return createEventBus({ driver: 'kafka', brokers: config.eventBus.kafkaBrokers });
    case 'memory':
    default:
      return createEventBus({ driver: 'memory' });
  }
}

/** Lazily create (or return) the process-wide singleton event bus. */
export function getBus(config: AppConfig): EventBus {
  if (!bus) bus = createEventBusFromConfig(config);
  return bus;
}

/** Test hook: inject a fake/memory bus, or clear the singleton so the next getBus() rebuilds it. */
export function setBusForTests(fake: EventBus | undefined): void {
  bus = fake;
}

export async function closeBus(): Promise<void> {
  if (bus) {
    await bus.close();
    bus = undefined;
  }
}

export type { EventBus };
