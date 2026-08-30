import { createClient, type GameWorldClient } from '@sonic-gameworld/gameworld-sdk';

/**
 * Base URL of the GameWorld API. Override with `NEXT_PUBLIC_API_URL` in `.env.local`.
 * Falls back to the local dev services/api port so the app "just works" against a
 * locally-running API without extra configuration.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** GameWorld Studio origin, used for "Remix this world" deep links. */
export const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'http://localhost:3000';

/** GameWorld Market origin, used for creator storefront / product deep links. */
export const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL ?? 'http://localhost:3001';

const TOKEN_STORAGE_KEY = 'gw-player-token';

function readStoredToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

let singleton: GameWorldClient | undefined;

/** Get (creating if needed) the shared GameWorld API client for the browser session. */
export function getGameWorldClient(): GameWorldClient {
  if (!singleton) {
    singleton = createClient({ baseUrl: API_BASE_URL, token: readStoredToken() });
  }
  return singleton;
}

/** Store (or clear) the bearer token used for subsequent API + realtime calls. */
export function setStoredToken(token: string | undefined): void {
  getGameWorldClient().setToken(token);
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

/**
 * Run an API call with a timeout and a fallback for offline/demo use — GameWorld Play must be
 * fully explorable even when `services/api` is unreachable (sandboxed reviewers, first-run
 * onboarding, offline demo mode).
 */
export async function withDemoFallback<T>(fn: () => Promise<T>, fallback: () => T, timeoutMs = 3500): Promise<{ data: T; online: boolean }> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
    const data = await Promise.race([fn(), timeout]);
    return { data, online: true };
  } catch {
    return { data: fallback(), online: false };
  }
}
