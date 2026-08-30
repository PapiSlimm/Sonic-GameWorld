import type { GameWorldClient } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client';

/**
 * Sandbox request presets — each one calls a real `gameworld-sdk` method (never a raw `fetch`),
 * so the sandbox always exercises the same typed client an SDK consumer would use. `paramsSchema`
 * drives the editable form; `run` parses the edited JSON and invokes the SDK call.
 */
export interface SandboxParam {
  key: string;
  label: string;
  placeholder?: string;
}

export interface SandboxPreset {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  label: string;
  description: string;
  defaultBody: string;
  requiresAuth: boolean;
  run: (client: GameWorldClient, body: SandboxBody) => Promise<unknown>;
}

/**
 * The sandbox's request body comes from a freeform JSON textarea the visitor edits, so its shape
 * can't be statically known — `any` here (rather than `unknown`) lets each preset's `run` pass it
 * straight through to the matching typed SDK method without per-preset casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SandboxBody = any;

export const SANDBOX_PRESETS: SandboxPreset[] = [
  {
    id: 'health', method: 'GET', path: '/v1/health', label: 'Health check',
    description: 'Unauthenticated liveness probe.', defaultBody: '{}', requiresAuth: false,
    run: (client) => client.health.check(),
  },
  {
    id: 'auth-dev', method: 'POST', path: '/v1/auth/dev', label: 'Dev login',
    description: 'Exchange an email for a GameWorld JWT (non-production only).', requiresAuth: false,
    defaultBody: JSON.stringify({ email: 'sandbox@sonicgameworld.dev', displayName: 'Sandbox User' }, null, 2),
    run: (client, body) => client.auth.dev(body),
  },
  {
    id: 'worlds-list', method: 'GET', path: '/v1/worlds', label: 'List worlds',
    description: 'Paginated worlds owned by the caller.', requiresAuth: true,
    defaultBody: JSON.stringify({ limit: 10 }, null, 2),
    run: (client, body) => client.worlds.list(body),
  },
  {
    id: 'marketplace-search', method: 'GET', path: '/v1/marketplace/search', label: 'Marketplace search',
    description: 'Spatial-discovery product search.', requiresAuth: false,
    defaultBody: JSON.stringify({ q: 'cyberpunk', limit: 5 }, null, 2),
    run: (client, body) => client.marketplace.search(body),
  },
  {
    id: 'ai-command', method: 'POST', path: '/v1/ai/command', label: 'AI Director command',
    description: 'Send natural language to the AI orchestrator for a world.', requiresAuth: true,
    defaultBody: JSON.stringify({ worldId: 'world_demo_01', text: 'spawn 3 enemies near building 7', mode: 'BUILDER' }, null, 2),
    run: (client, body) => client.ai.command(body),
  },
  {
    id: 'moderation-queue', method: 'GET', path: '/v1/moderation/queue', label: 'Moderation queue',
    description: 'List pending moderation cases (requires a moderator/platform_admin role).', requiresAuth: true,
    defaultBody: JSON.stringify({ limit: 10 }, null, 2),
    run: (client, body) => client.moderation.queue(body),
  },
  {
    id: 'analytics-overview', method: 'GET', path: '/v1/analytics', label: 'Analytics overview',
    description: 'Platform-wide analytics totals and series.', requiresAuth: true,
    defaultBody: '{}',
    run: (client, body) => client.analytics.overview(body),
  },
  {
    id: 'search', method: 'GET', path: '/v1/search', label: 'Global search',
    description: 'Cross-entity search (worlds, games, assets, products).', requiresAuth: false,
    defaultBody: JSON.stringify({ q: 'neon city' }, null, 2),
    run: (client, body) => client.search.query(body),
  },
];

/** A believable canned response used when a preset fails (offline API, missing role, etc.). */
export const SANDBOX_DEMO_RESPONSES: Record<string, unknown> = {
  health: { status: 'ok', version: 'demo', uptimeS: 0, timestamp: new Date().toISOString() },
  'auth-dev': { tokens: { accessToken: 'demo.jwt.token', refreshToken: 'demo.refresh.token' }, user: { id: 'user_demo', email: 'sandbox@sonicgameworld.dev', tier: 'CREATOR', roles: ['owner'] } },
  'worlds-list': { items: [{ id: 'world_demo_01', name: 'Frontier Outpost Alpha', status: 'PUBLISHED' }], nextCursor: null },
  'marketplace-search': { items: [{ id: 'prod_demo_01', name: 'Cyberpunk Alley Kit', category: 'ENVIRONMENT', priceCents: 2499 }], nextCursor: null, facets: {} },
  'ai-command': { plan: ['spawn_npc x3 near building_7'], executed: [{ tool: 'spawn_npc', ok: true }], denied: [], narration: 'Three hostiles now patrol the perimeter of Building 7.' },
  'moderation-queue': { items: [{ id: 'mod_demo_01', refKind: 'ASSET', status: 'PENDING', severity: 'HIGH' }], nextCursor: null },
  'analytics-overview': { period: { from: '', to: '' }, totals: { revenueCents: 18423000, assetUploads: 8931 }, series: {} },
  search: { items: [{ id: 'world_demo_02', kind: 'WORLD', title: 'Neon City' }], nextCursor: null },
};
