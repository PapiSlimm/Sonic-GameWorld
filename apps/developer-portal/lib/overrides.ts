'use client';

/**
 * Generic localStorage-backed store for state this app owns entirely client-side: created API
 * key metadata (there is no `GET /v1/auth/api-keys` list route — see README), and local overlays
 * (delete / update / test-send / delivery log) for webhook actions CONTRACTS §9 doesn't expose yet.
 */
export function readStore<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

export function writeStore<T>(key: string, store: Record<string, T>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* storage unavailable — edits stay in memory for this session only */
  }
}

export function upsertEntry<T extends object>(key: string, id: string, patch: Partial<T>): Record<string, T> {
  const store = readStore<T>(key);
  const next = { ...store, [id]: { ...(store[id] as object | undefined), ...patch } as T };
  writeStore(key, next);
  return next;
}

export function removeEntry<T>(key: string, id: string): Record<string, T> {
  const store = readStore<T>(key);
  const { [id]: _removed, ...rest } = store;
  writeStore(key, rest);
  return rest;
}

export function readList<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(key: string, list: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
