import { hostname } from 'node:os';
import { Redis, type RedisOptions } from 'ioredis';
import { deserializeEvent, Dispatcher, serializeEvent } from '../core.js';
import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from '../types.js';

export interface RedisBusOptions {
  /** redis:// URL or an existing ioredis instance. */
  url?: string;
  client?: Redis;
  redisOptions?: RedisOptions;
  /** Stream key. Default `gameworld:events`. */
  stream?: string;
  /** Consumer group. Default `gameworld`. Each service should use its own group to receive every event. */
  group?: string;
  /** Consumer name. Default `${hostname}-${pid}`. */
  consumer?: string;
  /** XREADGROUP block time in ms. Default 2000. */
  blockMs?: number;
  /** Batch size per read. Default 32. */
  batchSize?: number;
  /** MAXLEN ~ trimming for the stream. Default 100_000. */
  maxLen?: number;
  /** Also dispatch published events to local subscribers immediately (default false; consumers get them via the stream). */
  localEcho?: boolean;
  onError?: (err: unknown, event: DomainEvent) => void;
  logger?: { error(msg: string, err?: unknown): void; info?(msg: string): void };
}

/**
 * Redis Streams driver with consumer groups. Every `subscribe` call shares one consumer loop;
 * the loop starts lazily on first subscription and stops on close().
 */
export class RedisEventBus implements EventBus {
  readonly driver = 'redis' as const;
  private readonly dispatcher: Dispatcher;
  private readonly publisher: Redis;
  private readonly consumerClient: Redis;
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer: string;
  private readonly blockMs: number;
  private readonly batchSize: number;
  private readonly maxLen: number;
  private readonly localEcho: boolean;
  private readonly logger: NonNullable<RedisBusOptions['logger']>;
  private loop: Promise<void> | null = null;
  private running = false;
  private closed = false;
  private groupReady: Promise<void> | null = null;

  constructor(opts: RedisBusOptions = {}) {
    this.dispatcher = new Dispatcher(opts.onError);
    const url = opts.url ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const redisOptions: RedisOptions = { maxRetriesPerRequest: null, lazyConnect: true, ...opts.redisOptions };
    this.publisher = opts.client ?? new Redis(url, redisOptions);
    // Blocking reads need a dedicated connection.
    this.consumerClient = opts.client ? opts.client.duplicate() : new Redis(url, redisOptions);
    this.stream = opts.stream ?? 'gameworld:events';
    this.group = opts.group ?? 'gameworld';
    this.consumer = opts.consumer ?? `${hostname()}-${process.pid}`;
    this.blockMs = opts.blockMs ?? 2000;
    this.batchSize = opts.batchSize ?? 32;
    this.maxLen = opts.maxLen ?? 100_000;
    this.localEcho = opts.localEcho ?? false;
    this.logger = opts.logger ?? { error: (m, e) => console.error(m, e) };
  }

  private async ensureGroup(): Promise<void> {
    if (!this.groupReady) {
      this.groupReady = (async () => {
        try {
          await this.publisher.xgroup('CREATE', this.stream, this.group, '$', 'MKSTREAM');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('BUSYGROUP')) throw err;
        }
      })();
    }
    return this.groupReady;
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.closed) throw new Error('RedisEventBus is closed');
    await this.publisher.xadd(this.stream, 'MAXLEN', '~', String(this.maxLen), '*', 'type', event.type, 'event', serializeEvent(event));
    if (this.localEcho) await this.dispatcher.dispatch(event);
  }

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    const off = this.dispatcher.subscribe(type, handler);
    this.startLoop();
    return off;
  }

  private startLoop(): void {
    if (this.running || this.closed) return;
    this.running = true;
    this.loop = this.consume().catch((err) => this.logger.error('[events:redis] consumer loop crashed', err));
  }

  private async consume(): Promise<void> {
    await this.ensureGroup();
    // First drain any pending (previously delivered but un-acked) messages for this consumer, then read new ones.
    let cursor: string = '0';
    while (this.running) {
      try {
        const res = (await this.consumerClient.xreadgroup(
          'GROUP', this.group, this.consumer, 'COUNT', this.batchSize, 'BLOCK', this.blockMs, 'STREAMS', this.stream, cursor,
        )) as [string, [string, string[]][]][] | null;
        if (!res) {
          cursor = '>';
          continue;
        }
        for (const [, entries] of res) {
          if (entries.length === 0 && cursor === '0') cursor = '>';
          for (const [entryId, fields] of entries) {
            const idx = fields.indexOf('event');
            const raw = idx >= 0 ? fields[idx + 1] : undefined;
            if (raw) {
              try {
                const event = deserializeEvent(raw);
                await this.dispatcher.dispatch(event);
              } catch (err) {
                this.logger.error(`[events:redis] failed to process ${entryId}`, err);
              }
            }
            await this.publisher.xack(this.stream, this.group, entryId);
          }
        }
        if (cursor === '0') cursor = '>';
      } catch (err) {
        if (!this.running) break;
        this.logger.error('[events:redis] read error; retrying', err);
        await new Promise((r) => setTimeout(r, Math.min(this.blockMs, 1000)));
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.running = false;
    this.dispatcher.clear();
    // Unblock the consumer read.
    try {
      this.consumerClient.disconnect();
    } catch {
      /* ignore */
    }
    if (this.loop) await this.loop;
    try {
      await this.publisher.quit();
    } catch {
      this.publisher.disconnect();
    }
  }
}
