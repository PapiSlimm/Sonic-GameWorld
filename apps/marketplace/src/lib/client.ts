import { createClient, type GameWorldClient } from '@sonic-gameworld/gameworld-sdk';

const DEFAULT_BASE_URL = 'http://localhost:4000';

function resolveBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return DEFAULT_BASE_URL;
}

let cached: GameWorldClient | undefined;

/**
 * Shared GameWorld API client for the marketplace app.
 *
 * The app is designed to run fully offline against `src/lib/demo.ts` when the
 * `services/api` backend is unreachable (sandbox / local demo mode) — every
 * data-fetching helper in `src/lib/data.ts` calls through this client first and
 * falls back to the bundled demo dataset on any network/API error.
 */
export function getGameWorldClient(): GameWorldClient {
  cached ??= createClient({ baseUrl: resolveBaseUrl() });
  return cached;
}

/** Read a token from localStorage (browser only) — set by a future auth flow. */
export function getStoredToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem('gw_token') ?? undefined;
  } catch {
    return undefined;
  }
}
