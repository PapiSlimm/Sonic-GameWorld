import { createClient, type GameWorldClient } from '@sonic-gameworld/gameworld-sdk';

const DEFAULT_BASE_URL = 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'gw_studio_token';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BASE_URL;
}

function readStoredToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeToken(token: string | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // localStorage unavailable (private mode, SSR edge case) - ignore, session just won't persist.
  }
}

let singleton: GameWorldClient | undefined;

/** Lazily creates a singleton GameWorldClient bound to NEXT_PUBLIC_API_URL (or localhost:4000). */
export function getClient(): GameWorldClient {
  if (!singleton) {
    singleton = createClient({ baseUrl: baseUrl(), token: readStoredToken() });
  }
  return singleton;
}

export function getApiBaseUrl(): string {
  return baseUrl();
}

/**
 * Ensures the client has a session token, attempting a dev login the first time it's needed.
 * Resolves to `false` (never throws) when the API is unreachable, so callers can fall back to
 * the offline demo world.
 */
export async function ensureSession(): Promise<boolean> {
  const client = getClient();
  const existing = readStoredToken();
  if (existing) {
    client.setToken(existing);
    try {
      await client.auth.me();
      return true;
    } catch {
      storeToken(undefined);
      client.setToken(undefined);
    }
  }
  try {
    const session = await client.auth.dev({ email: 'studio-demo@sonicgameworld.dev', displayName: 'Studio Demo Creator' });
    client.setToken(session.tokens.accessToken);
    storeToken(session.tokens.accessToken);
    return true;
  } catch {
    return false;
  }
}

/** Quick reachability probe used to decide whether to render the "offline demo" badge. */
export async function pingApi(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${baseUrl()}/v1/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
