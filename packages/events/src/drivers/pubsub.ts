import { deserializeEvent, Dispatcher, serializeEvent } from '../core.js';
import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from '../types.js';

export interface PubSubBusOptions {
  projectId?: string;
  /** Topic name. Default `${prefix}-events`. */
  topic?: string;
  /** Subscription name. Default `${topic}-${subscriber}`. */
  subscription?: string;
  /** Prefix (from PUBSUB_TOPIC_PREFIX). Default `gameworld`. */
  prefix?: string;
  /** Logical subscriber name so each service gets its own subscription. Default `api`. */
  subscriber?: string;
  /** Create topic/subscription if missing. Default true. */
  autoCreate?: boolean;
  onError?: (err: unknown, event: DomainEvent) => void;
  logger?: { error(msg: string, err?: unknown): void };
}

// Minimal structural types for the lazily-imported @google-cloud/pubsub client, so the
// module can be typechecked and bundled without the dependency being resolvable at runtime.
interface PSMessage { data: Buffer; attributes: Record<string, string>; ack(): void; nack(): void }
interface PSSubscription {
  on(event: 'message', h: (m: PSMessage) => void): void;
  on(event: 'error', h: (e: unknown) => void): void;
  exists(): Promise<[boolean]>;
  close(): Promise<void>;
  removeAllListeners(): void;
}
interface PSTopic {
  exists(): Promise<[boolean]>;
  create(): Promise<unknown>;
  publishMessage(msg: { data: Buffer; attributes?: Record<string, string> }): Promise<string>;
  subscription(name: string): PSSubscription;
  createSubscription(name: string): Promise<[PSSubscription]>;
}
interface PSClient { topic(name: string): PSTopic; close(): Promise<void> }

/**
 * Google Cloud Pub/Sub driver. `@google-cloud/pubsub` is imported lazily so environments without
 * GCP credentials (tests, memory/redis deployments) never load it.
 */
export class PubSubEventBus implements EventBus {
  readonly driver = 'pubsub' as const;
  private readonly dispatcher: Dispatcher;
  private readonly opts: PubSubBusOptions;
  private readonly topicName: string;
  private readonly subscriptionName: string;
  private client: PSClient | null = null;
  private topic: PSTopic | null = null;
  private subscription: PSSubscription | null = null;
  private ready: Promise<PSTopic> | null = null;
  private closed = false;
  private readonly logger: NonNullable<PubSubBusOptions['logger']>;

  constructor(opts: PubSubBusOptions = {}) {
    this.opts = opts;
    this.dispatcher = new Dispatcher(opts.onError);
    const prefix = opts.prefix ?? process.env['PUBSUB_TOPIC_PREFIX'] ?? 'gameworld';
    this.topicName = opts.topic ?? `${prefix}-events`;
    this.subscriptionName = opts.subscription ?? `${this.topicName}-${opts.subscriber ?? 'api'}`;
    this.logger = opts.logger ?? { error: (m, e) => console.error(m, e) };
  }

  private async ensureTopic(): Promise<PSTopic> {
    if (!this.ready) {
      this.ready = (async () => {
        const mod = (await import('@google-cloud/pubsub')) as unknown as { PubSub: new (o?: { projectId?: string }) => PSClient };
        const projectId = this.opts.projectId ?? process.env['GCP_PROJECT_ID'];
        this.client = new mod.PubSub(projectId ? { projectId } : undefined);
        const topic = this.client.topic(this.topicName);
        if (this.opts.autoCreate !== false) {
          const [exists] = await topic.exists();
          if (!exists) await topic.create();
        }
        this.topic = topic;
        return topic;
      })();
    }
    return this.ready;
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.closed) throw new Error('PubSubEventBus is closed');
    const topic = await this.ensureTopic();
    await topic.publishMessage({ data: Buffer.from(serializeEvent(event)), attributes: { type: event.type, ...(event.orgId ? { orgId: event.orgId } : {}) } });
  }

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    const off = this.dispatcher.subscribe(type, handler);
    void this.ensureSubscription();
    return off;
  }

  private async ensureSubscription(): Promise<void> {
    if (this.subscription || this.closed) return;
    try {
      const topic = await this.ensureTopic();
      let sub = topic.subscription(this.subscriptionName);
      if (this.opts.autoCreate !== false) {
        const [exists] = await sub.exists();
        if (!exists) [sub] = await topic.createSubscription(this.subscriptionName);
      }
      if (this.subscription) return;
      this.subscription = sub;
      sub.on('message', (m) => {
        void (async () => {
          try {
            const event = deserializeEvent(m.data);
            await this.dispatcher.dispatch(event);
            m.ack();
          } catch (err) {
            this.logger.error('[events:pubsub] message failed', err);
            m.nack();
          }
        })();
      });
      sub.on('error', (err) => this.logger.error('[events:pubsub] subscription error', err));
    } catch (err) {
      this.logger.error('[events:pubsub] failed to open subscription', err);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.dispatcher.clear();
    if (this.subscription) {
      this.subscription.removeAllListeners();
      await this.subscription.close().catch(() => undefined);
    }
    await this.client?.close().catch(() => undefined);
  }
}
