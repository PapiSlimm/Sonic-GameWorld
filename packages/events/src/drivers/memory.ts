import { Dispatcher } from '../core.js';
import type { DomainEvent, EventBus, EventHandler, Unsubscribe } from '../types.js';

export interface MemoryBusOptions {
  /** Keep a bounded history of published events (useful in tests). Default 1000, 0 disables. */
  historySize?: number;
  onError?: (err: unknown, event: DomainEvent) => void;
}

export class MemoryEventBus implements EventBus {
  readonly driver = 'memory' as const;
  private readonly dispatcher: Dispatcher;
  private readonly historySize: number;
  private readonly _history: DomainEvent[] = [];
  private closed = false;

  constructor(opts: MemoryBusOptions = {}) {
    this.dispatcher = new Dispatcher(opts.onError);
    this.historySize = opts.historySize ?? 1000;
  }

  get history(): readonly DomainEvent[] {
    return this._history;
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.closed) throw new Error('MemoryEventBus is closed');
    if (this.historySize > 0) {
      this._history.push(event);
      if (this._history.length > this.historySize) this._history.splice(0, this._history.length - this.historySize);
    }
    await this.dispatcher.dispatch(event);
  }

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    return this.dispatcher.subscribe(type, handler);
  }

  /** Wait until an event of a type is published (test helper). */
  waitFor<E extends DomainEvent = DomainEvent>(type: string, timeoutMs = 2000): Promise<E> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for ${type}`));
      }, timeoutMs);
      const off = this.subscribe(type, (e) => {
        clearTimeout(timer);
        off();
        resolve(e as E);
      });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.dispatcher.clear();
  }
}
