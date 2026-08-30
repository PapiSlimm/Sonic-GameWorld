/** Minimal typed event emitter — no Node "events" dependency so it works in browser + SSR + tests alike. */
export type Unsubscribe = () => void;

export class TinyEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<(payload: never) => void>>();

  on<K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as (payload: never) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof EventMap>(event: K, fn: (payload: EventMap[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (payload: never) => void);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      (fn as (payload: EventMap[K]) => void)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
