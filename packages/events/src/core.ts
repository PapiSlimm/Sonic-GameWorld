import { randomUUID } from 'node:crypto';
import type { DomainEvent, EventHandler, EventType, PayloadOf, TypedEvent, Unsubscribe } from './types.js';

export interface CreateEventInput<T extends string, P> {
  type: T;
  payload: P;
  actorId?: string;
  orgId?: string;
  id?: string;
  occurredAt?: string | Date;
}

/** Build a well-formed DomainEvent (id + timestamp + version). */
export function createEvent<T extends EventType>(input: CreateEventInput<T, PayloadOf<T>>): TypedEvent<T>;
export function createEvent<T extends string, P>(input: CreateEventInput<T, P>): DomainEvent<T, P>;
export function createEvent<T extends string, P>(input: CreateEventInput<T, P>): DomainEvent<T, P> {
  const occurredAt = input.occurredAt instanceof Date ? input.occurredAt.toISOString() : (input.occurredAt ?? new Date().toISOString());
  const e: DomainEvent<T, P> = { id: input.id ?? randomUUID(), type: input.type, occurredAt, payload: input.payload, version: 1 };
  if (input.actorId !== undefined) e.actorId = input.actorId;
  if (input.orgId !== undefined) e.orgId = input.orgId;
  return e;
}

export function isDomainEvent(v: unknown): v is DomainEvent {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['type'] === 'string' && typeof o['occurredAt'] === 'string' && o['version'] === 1 && 'payload' in o;
}

export function serializeEvent(e: DomainEvent): string {
  return JSON.stringify(e);
}

export function deserializeEvent(raw: string | Buffer): DomainEvent {
  const parsed: unknown = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  if (!isDomainEvent(parsed)) throw new Error('Malformed DomainEvent payload');
  return parsed;
}

export interface TypedHandler<T extends EventType> {
  type: T;
  handle: (event: TypedEvent<T>) => void | Promise<void>;
}

/** Define a typed handler for a specific event type; use `bus.subscribe(h.type, h.handle)` or `registerHandler`. */
export function defineHandler<T extends EventType>(type: T, handle: (event: TypedEvent<T>) => void | Promise<void>): TypedHandler<T> {
  return { type, handle };
}

export function registerHandler<T extends EventType>(bus: { subscribe(type: string, h: EventHandler): Unsubscribe }, handler: TypedHandler<T>): Unsubscribe {
  return bus.subscribe(handler.type, handler.handle as EventHandler);
}

/**
 * Local dispatcher shared by all drivers: maintains per-type and wildcard handler sets,
 * dispatches sequentially per handler (errors isolated + reported via onError).
 */
export class Dispatcher {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  constructor(private readonly onError: (err: unknown, event: DomainEvent) => void = (err, event) => {
    // eslint-disable-next-line no-console
    console.error(`[events] handler error for ${event.type}:`, err);
  }) {}

  subscribe(type: string, handler: EventHandler): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set && set.size === 0) this.handlers.delete(type);
    };
  }

  hasSubscribers(type?: string): boolean {
    if (type === undefined) return this.handlers.size > 0;
    return (this.handlers.get(type)?.size ?? 0) > 0 || (this.handlers.get('*')?.size ?? 0) > 0;
  }

  subscribedTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  async dispatch(event: DomainEvent): Promise<void> {
    const targets = [...(this.handlers.get(event.type) ?? []), ...(this.handlers.get('*') ?? [])];
    await Promise.all(
      targets.map(async (h) => {
        try {
          await h(event);
        } catch (err) {
          this.onError(err, event);
        }
      }),
    );
  }

  clear(): void {
    this.handlers.clear();
  }
}
