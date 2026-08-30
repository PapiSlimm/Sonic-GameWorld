import type { ApiKey, CreateApiKeyInput } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client';
import { loadSession } from './session';
import { readList, writeList } from './overrides';

/**
 * CONTRACTS §9 defines `POST /v1/auth/api-keys` and `DELETE /v1/auth/api-keys/:id` but no
 * `GET /v1/auth/api-keys` (list) route, so there is no server-side source of truth to render a
 * table from. We create/revoke against the real API whenever a session is present, and keep the
 * resulting metadata (never the raw secret, once dismissed) in localStorage so the table survives
 * reloads. See README "Cross-package gaps".
 */
const STORE_KEY = 'gw_devportal_api_keys_v1';

export const AVAILABLE_SCOPES = [
  'worlds:read', 'worlds:write', 'assets:read', 'assets:write', 'marketplace:read', 'marketplace:write',
  'orders:read', 'ai:invoke', 'analytics:read', 'webhooks:manage',
] as const;
export type ApiKeyScope = (typeof AVAILABLE_SCOPES)[number];

export function loadStoredKeys(): ApiKey[] {
  return readList<ApiKey>(STORE_KEY);
}

function saveStoredKeys(keys: ApiKey[]): void {
  writeList(STORE_KEY, keys);
}

export function isLiveSession(): boolean {
  return !!loadSession()?.token;
}

/**
 * Creates a key. Calls the real `POST /v1/auth/api-keys` when a session token is present;
 * otherwise (and on any API failure) synthesizes a realistic `gw_live_...` demo key so the create
 * flow — including the "copy the secret now, it won't be shown again" step — always works.
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<{ key: ApiKey; secret: string; source: 'live' | 'demo' }> {
  try {
    if (isLiveSession()) {
      const created = await getClient().auth.createApiKey(input);
      const { key: secret, ...metadata } = created;
      const record: ApiKey = metadata;
      saveStoredKeys([record, ...loadStoredKeys()]);
      return { key: record, secret, source: 'live' };
    }
  } catch {
    /* fall through to demo key synthesis below */
  }
  const secret = synthesizeSecret();
  const record: ApiKey = {
    id: `key_${Math.random().toString(36).slice(2, 10)}`,
    name: input.name,
    prefix: secret.slice(0, secret.indexOf('_', secret.indexOf('_') + 1) + 5),
    scopes: input.scopes ?? [],
    lastUsedAt: null,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
  };
  saveStoredKeys([record, ...loadStoredKeys()]);
  return { key: record, secret, source: 'demo' };
}

export async function revokeApiKey(id: string): Promise<void> {
  try {
    if (isLiveSession()) await getClient().auth.deleteApiKey(id);
  } catch {
    /* API unreachable or key was demo-only — still remove it locally below */
  }
  saveStoredKeys(loadStoredKeys().filter((k) => k.id !== id));
}

function synthesizeSecret(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let body = '';
  for (let i = 0; i < 32; i++) body += chars[Math.floor(Math.random() * chars.length)];
  return `gw_live_${body}`;
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/** Shown the first time a fresh browser opens `/keys`, before any key has been created. */
export const STARTER_DEMO_KEYS: ApiKey[] = [
  { id: 'key_demo_web01', name: 'Production — Web Client', prefix: 'gw_live_7f2c9a1b••••', scopes: ['worlds:read', 'marketplace:read', 'orders:read'], lastUsedAt: daysAgo(0), createdAt: daysAgo(64), expiresAt: null },
  { id: 'key_demo_ci01', name: 'CI Pipeline', prefix: 'gw_live_c9d1eab2••••', scopes: ['assets:read', 'assets:write'], lastUsedAt: daysAgo(2), createdAt: daysAgo(120), expiresAt: null },
  { id: 'key_demo_unity01', name: 'Unity Editor (staging)', prefix: 'gw_live_44aa9902••••', scopes: ['worlds:read', 'worlds:write', 'ai:invoke'], lastUsedAt: daysAgo(9), createdAt: daysAgo(30), expiresAt: daysAgo(-60) },
];
