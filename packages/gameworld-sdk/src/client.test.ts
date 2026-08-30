import { describe, expect, it, vi } from 'vitest';
import { createClient } from './client.js';
import { ApiError } from './http.js';
import { PACKAGE_NAME } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('@sonic-gameworld/gameworld-sdk', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@sonic-gameworld/gameworld-sdk');
  });

  it('builds requests with the base URL, query params and auth headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/v1/worlds?limit=5');
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer test-token');
      return jsonResponse({ items: [], nextCursor: null });
    });

    const client = createClient({ baseUrl: 'https://api.example.com', token: 'test-token', fetch: fetchMock as unknown as typeof fetch });
    const page = await client.worlds.list({ limit: 5 });

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('sends x-api-key when configured and JSON-encodes the request body', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/v1/ai/command');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-api-key')).toBe('gw_live_abc');
      expect(headers.get('content-type')).toBe('application/json');
      expect(JSON.parse(String(init?.body))).toEqual({ worldId: 'w1', text: 'start the storm' });
      return jsonResponse({ plan: { role: 'DIRECTOR', toolCalls: [] }, executed: [], denied: [], narration: 'ok' });
    });

    const client = createClient({ baseUrl: 'https://api.example.com', apiKey: 'gw_live_abc', fetch: fetchMock as unknown as typeof fetch });
    const result = await client.ai.command({ worldId: 'w1', text: 'start the storm' });
    expect(result.narration).toBe('ok');
  });

  it('throws an ApiError with the parsed error envelope on non-2xx responses', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'World not found', details: { id: 'missing' } } }, 404),
    );
    const client = createClient({ baseUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch });

    await expect(client.worlds.get('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'World not found',
    });
    await expect(client.worlds.get('missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('normalizes the base URL and leading slash on paths', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.example.com/v1/health');
      return jsonResponse({ status: 'ok', version: '1.0.0', uptimeS: 1, timestamp: new Date().toISOString() });
    });
    const client = createClient({ baseUrl: 'https://api.example.com/', fetch: fetchMock as unknown as typeof fetch });
    const health = await client.health.check();
    expect(health.status).toBe('ok');
  });
});
