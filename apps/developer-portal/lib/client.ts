import { createClient, type GameWorldClient } from '@sonic-gameworld/gameworld-sdk';
import { loadSession } from './session';

/** Base URL of the GameWorld API (CONTRACTS.md §9). Falls back to the local dev API port. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:4000').replace(/\/+$/, '');

let cached: GameWorldClient | undefined;

/** Returns a shared SDK client, re-syncing the bearer token from the stored session on every call. */
export function getClient(): GameWorldClient {
  if (!cached) cached = createClient({ baseUrl: API_BASE_URL });
  cached.setToken(loadSession()?.token);
  return cached;
}
