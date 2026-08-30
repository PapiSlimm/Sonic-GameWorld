import { hostname } from 'node:os';
import { deserializeEvent, Dispatcher, serializeEvent } from '../core.js';
import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from '../types.js';

export interface KafkaBusOptions {
  brokers?: string[];
  clientId?: string;
  /** Topic. Default `gameworld.events`. */
  topic?: string;
  /** Consumer group id. Default `gameworld-api`. */
  groupId?: string;
  fromBeginning?: boolean;
  ssl?: boolean;
  sasl?: { mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'; username: string; password: string };
  onError?: (err: unknown, event: DomainEvent) => void;
  logger?: { error(msg: string, err?: unknown): void };
}

// Structural types for lazily-imported kafkajs.
interface KProducer { connect(): Promise<void>; disconnect(): Promise<void>; send(r: { topic: string; messages: { key?: string; value: string; headers?: Record<string, string> }[] }): Promise<unknown> }
interface KConsumer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(o: { topic: string; fromBeginning?: boolean }): Promise<void>;
  run(o: { eachMessage: (p: { message: { value: Buffer | null } }) => Promise<void> }): Promise<void>;
}
interface KClient { producer(): KProducer; consumer(o: { groupId: string }): KConsumer }

/**
 * Kafka driver on kafkajs. Lazily imported so the dependency is only loaded when the driver is selected.
 */
export class KafkaEventBus implements EventBus {
  readonly driver = 'kafka' as const;
  private readonly dispatcher: Dispatcher;
  private readonly opts: KafkaBusOptions;
  private readonly topic: string;
  private readonly groupId: string;
  private client: Promise<KClient> | null = null;
  private producer: Promise<KProducer> | null = null;
  private consumer: KConsumer | null = null;
  private closed = false;
  private readonly logger: NonNullable<KafkaBusOptions['logger']>;

  constructor(opts: KafkaBusOptions = {}) {
    this.opts = opts;
    this.dispatcher = new Dispatcher(opts.onError);
    this.topic = opts.topic ?? 'gameworld.events';
    this.groupId = opts.groupId ?? 'gameworld-api';
    this.logger = opts.logger ?? { error: (m, e) => console.error(m, e) };
  }

  private getClient(): Promise<KClient> {
    if (!this.client) {
      this.client = (async () => {
        const mod = (await import('kafkajs')) as unknown as { Kafka: new (o: Record<string, unknown>) => KClient };
        const brokers = this.opts.brokers ?? (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',').map((s) => s.trim()).filter(Boolean);
        const cfg: Record<string, unknown> = { clientId: this.opts.clientId ?? `gameworld-${hostname()}`, brokers };
        if (this.opts.ssl !== undefined) cfg['ssl'] = this.opts.ssl;
        if (this.opts.sasl) cfg['sasl'] = this.opts.sasl;
        return new mod.Kafka(cfg);
      })();
    }
    return this.client;
  }

  private getProducer(): Promise<KProducer> {
    if (!this.producer) {
      this.producer = (async () => {
        const p = (await this.getClient()).producer();
        await p.connect();
        return p;
      })();
    }
    return this.producer;
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.closed) throw new Error('KafkaEventBus is closed');
    const producer = await this.getProducer();
    await producer.send({
      topic: this.topic,
      messages: [{ key: event.orgId ?? event.type, value: serializeEvent(event), headers: { type: event.type } }],
    });
  }

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    const off = this.dispatcher.subscribe(type, handler);
    void this.ensureConsumer();
    return off;
  }

  private async ensureConsumer(): Promise<void> {
    if (this.consumer || this.closed) return;
    try {
      const consumer = (await this.getClient()).consumer({ groupId: this.groupId });
      this.consumer = consumer;
      await consumer.connect();
      await consumer.subscribe({ topic: this.topic, fromBeginning: this.opts.fromBeginning ?? false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            await this.dispatcher.dispatch(deserializeEvent(message.value));
          } catch (err) {
            this.logger.error('[events:kafka] message failed', err);
          }
        },
      });
    } catch (err) {
      this.logger.error('[events:kafka] failed to start consumer', err);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.dispatcher.clear();
    await this.consumer?.disconnect().catch(() => undefined);
    if (this.producer) await (await this.producer).disconnect().catch(() => undefined);
  }
}
