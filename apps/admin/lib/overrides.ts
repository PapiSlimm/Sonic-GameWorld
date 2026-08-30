'use client';

/**
 * Generic localStorage-backed "staged change" store. A handful of admin actions in this app
 * (tier overrides, payout holds, feature flags, ...) have no corresponding write endpoint in the
 * current API surface (see README "Cross-package gaps"). Rather than pretend to persist them
 * server-side, we stage the edit locally so the admin UI still feels real and durable across
 * reloads, and clearly label it as staged/local in the UI.
 */
export function readOverrideStore<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

export function writeOverrideStore<T>(key: string, store: Record<string, T>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* storage unavailable — edits stay in memory for this session only */
  }
}

export function upsertOverride<T extends object>(key: string, id: string, patch: Partial<T>): Record<string, T> {
  const store = readOverrideStore<T>(key);
  const next = { ...store, [id]: { ...(store[id] as object | undefined), ...patch } as T };
  writeOverrideStore(key, next);
  return next;
}

export function removeOverride<T>(key: string, id: string): Record<string, T> {
  const store = readOverrideStore<T>(key);
  const { [id]: _removed, ...rest } = store;
  writeOverrideStore(key, rest);
  return rest;
}
