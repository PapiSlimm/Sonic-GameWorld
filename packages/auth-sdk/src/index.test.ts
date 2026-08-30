import { describe, expect, it, vi } from 'vitest';
import { createAuthClient, PACKAGE_NAME } from './index.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('@sonic-gameworld/auth-sdk', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('@sonic-gameworld/auth-sdk');
  });

  it('createAuthClient() scopes requests to the auth namespace', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.example.com/v1/auth/dev');
      return jsonResponse({ tokens: { accessToken: 'jwt', expiresIn: 3600, tokenType: 'Bearer' }, user: { id: 'u1' } });
    });
    const auth = createAuthClient({ baseUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch });
    const session = await auth.dev({ email: 'dev@example.com' });
    expect(session.tokens.accessToken).toBe('jwt');
  });
});
