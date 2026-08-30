import { describe, expect, it, vi } from 'vitest';
import { createAnalyticsClient, PACKAGE_NAME } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('@sonic-gameworld/analytics-sdk', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@sonic-gameworld/analytics-sdk');
  });

  it('createAnalyticsClient() scopes requests to analytics/recommendation routes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example.com/v1/analytics/events');
      expect(JSON.parse(String(init?.body))).toEqual({ events: [{ name: 'view_product', productId: 'p1' }] });
      return jsonResponse({ accepted: 1, rejected: 0 });
    });
    const analytics = createAnalyticsClient({ baseUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch });
    const result = await analytics.analytics.track([{ name: 'view_product', productId: 'p1' }]);
    expect(result).toEqual({ accepted: 1, rejected: 0 });
  });
});
