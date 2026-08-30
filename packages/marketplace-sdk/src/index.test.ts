import { describe, expect, it, vi } from 'vitest';
import { createMarketplaceClient, PACKAGE_NAME, PRODUCT_CATEGORIES } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('@sonic-gameworld/marketplace-sdk', () => {
  it('exports the package name and the product taxonomy', () => {
    expect(PACKAGE_NAME).toBe('@sonic-gameworld/marketplace-sdk');
    expect(PRODUCT_CATEGORIES).toContain('WORLD');
    expect(PRODUCT_CATEGORIES).toHaveLength(10);
  });

  it('createMarketplaceClient() scopes requests to marketplace/commerce routes', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.example.com/v1/marketplace/search?q=cyberpunk');
      return jsonResponse({ items: [], nextCursor: null, total: 0 });
    });
    const marketplace = createMarketplaceClient({ baseUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch });
    const result = await marketplace.marketplace.search({ q: 'cyberpunk' });
    expect(result.total).toBe(0);
  });
});
