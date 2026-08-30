/**
 * A REST quickstart covering a representative cross-section of CONTRACTS §9's `/v1` surface —
 * grouped by domain, each with a `curl` example and the equivalent `gameworld-sdk` TypeScript call.
 * Not every route in §9 is reproduced here (there are ~90); this favors the routes a new
 * integration touches first in each domain. The full surface is always explorable live via the
 * OpenAPI explorer tab, which reflects the actual `services/api` build.
 */
export interface QuickstartExample {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  summary: string;
  curl: string;
  ts: string;
}

export interface QuickstartDomain {
  key: string;
  label: string;
  examples: QuickstartExample[];
}

const BASE = '${NEXT_PUBLIC_API_URL:-http://localhost:4000}';

export const QUICKSTART_DOMAINS: QuickstartDomain[] = [
  {
    key: 'auth', label: 'Auth',
    examples: [
      {
        method: 'POST', path: '/v1/auth/dev', summary: 'Exchange an email for a JWT (non-production only).',
        curl: `curl -X POST ${BASE}/v1/auth/dev \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@studio.dev","displayName":"You"}'`,
        ts: `const { tokens, user } = await client.auth.dev({ email: 'you@studio.dev' });\nclient.setToken(tokens.accessToken);`,
      },
      {
        method: 'POST', path: '/v1/auth/api-keys', summary: 'Create an SDK/server API key (shown once).',
        curl: `curl -X POST ${BASE}/v1/auth/api-keys \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"CI Pipeline","scopes":["assets:write"]}'`,
        ts: `const key = await client.auth.createApiKey({ name: 'CI Pipeline', scopes: ['assets:write'] });\n// key.key is the raw secret — store it now, it is never returned again.`,
      },
      {
        method: 'GET', path: '/v1/auth/me', summary: 'Fetch the caller identified by the bearer token.',
        curl: `curl ${BASE}/v1/auth/me -H "Authorization: Bearer $TOKEN"`,
        ts: `const me = await client.auth.me();`,
      },
    ],
  },
  {
    key: 'worlds', label: 'Worlds',
    examples: [
      {
        method: 'POST', path: '/v1/worlds', summary: 'Create a world.',
        curl: `curl -X POST ${BASE}/v1/worlds \\\n  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  -d '{"name":"Frontier Outpost Alpha","genre":["SCIFI"]}'`,
        ts: `const world = await client.worlds.create({ name: 'Frontier Outpost Alpha', genre: ['SCIFI'] });`,
      },
      {
        method: 'GET', path: '/v1/worlds', summary: 'List your worlds.',
        curl: `curl "${BASE}/v1/worlds?limit=20" -H "Authorization: Bearer $TOKEN"`,
        ts: `const { items } = await client.worlds.list({ limit: 20 });`,
      },
      {
        method: 'POST', path: '/v1/worlds/:id/publish', summary: 'Publish a world to the marketplace.',
        curl: `curl -X POST ${BASE}/v1/worlds/world_123/publish -H "Authorization: Bearer $TOKEN"`,
        ts: `const result = await client.worlds.publish('world_123');`,
      },
    ],
  },
  {
    key: 'assets', label: 'Assets',
    examples: [
      {
        method: 'POST', path: '/v1/assets/upload-url', summary: 'Get a presigned upload URL.',
        curl: `curl -X POST ${BASE}/v1/assets/upload-url \\\n  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  -d '{"fileName":"hero.glb","contentType":"model/gltf-binary"}'`,
        ts: `const { uploadUrl, assetId } = await client.assets.uploadUrl({ fileName: 'hero.glb', contentType: 'model/gltf-binary' });`,
      },
      {
        method: 'GET', path: '/v1/assets/:id/passport', summary: 'Read an asset’s provenance passport.',
        curl: `curl ${BASE}/v1/assets/asset_123/passport -H "Authorization: Bearer $TOKEN"`,
        ts: `const passport = await client.assets.passport('asset_123');`,
      },
    ],
  },
  {
    key: 'marketplace', label: 'Marketplace',
    examples: [
      {
        method: 'GET', path: '/v1/marketplace/search', summary: 'Search products by query, category or genre.',
        curl: `curl "${BASE}/v1/marketplace/search?q=cyberpunk&category=ENVIRONMENT"`,
        ts: `const results = await client.marketplace.search({ q: 'cyberpunk', category: 'ENVIRONMENT' });`,
      },
      {
        method: 'POST', path: '/v1/orders', summary: 'Checkout the current cart.',
        curl: `curl -X POST ${BASE}/v1/orders -H "Authorization: Bearer $TOKEN"`,
        ts: `const order = await client.orders.create();`,
      },
    ],
  },
  {
    key: 'ai', label: 'AI',
    examples: [
      {
        method: 'POST', path: '/v1/ai/command', summary: 'Send natural language to the AI orchestrator.',
        curl: `curl -X POST ${BASE}/v1/ai/command \\\n  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  -d '{"worldId":"world_123","text":"spawn 3 enemies near building 7"}'`,
        ts: `const result = await client.ai.command({ worldId: 'world_123', text: 'spawn 3 enemies near building 7' });\nconsole.log(result.narration);`,
      },
    ],
  },
  {
    key: 'moderation', label: 'Moderation',
    examples: [
      {
        method: 'GET', path: '/v1/moderation/queue', summary: 'List pending moderation cases (moderator/platform_admin).',
        curl: `curl ${BASE}/v1/moderation/queue -H "Authorization: Bearer $TOKEN"`,
        ts: `const { items } = await client.moderation.queue();`,
      },
    ],
  },
  {
    key: 'developer', label: 'Developer',
    examples: [
      {
        method: 'POST', path: '/v1/developer/webhooks', summary: 'Register a webhook subscription.',
        curl: `curl -X POST ${BASE}/v1/developer/webhooks \\\n  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  -d '{"url":"https://you.dev/hooks","events":["ORDER_PAID"]}'`,
        ts: `const webhook = await client.developer.createWebhook({ url: 'https://you.dev/hooks', events: ['ORDER_PAID'] });`,
      },
    ],
  },
  {
    key: 'analytics', label: 'Analytics & Search',
    examples: [
      {
        method: 'GET', path: '/v1/analytics', summary: 'Platform-wide analytics totals and series.',
        curl: `curl ${BASE}/v1/analytics -H "Authorization: Bearer $TOKEN"`,
        ts: `const overview = await client.analytics.overview();`,
      },
      {
        method: 'GET', path: '/v1/search', summary: 'Cross-entity search.',
        curl: `curl "${BASE}/v1/search?q=neon+city"`,
        ts: `const { items } = await client.search.query({ q: 'neon city' });`,
      },
    ],
  },
];
