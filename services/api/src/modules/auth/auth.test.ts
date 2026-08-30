import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

describe('auth: dev login → /auth/me', () => {
  let ctx: TestApp;

  afterEach(async () => {
    await ctx?.close();
  });

  it('creates a user on first dev login and returns a usable session', async () => {
    ctx = await buildTestApp();
    const email = 'ada@example.com';

    const res = await ctx.app.inject({ method: 'POST', url: '/v1/auth/dev', payload: { email } });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.user.email).toBe(email);
    expect(body.user.roles).toEqual(['player']);
    expect(body.user.tier).toBe('STARTER');
    expect(body.tokens.tokenType).toBe('Bearer');
    expect(typeof body.tokens.accessToken).toBe('string');
    expect(typeof body.tokens.refreshToken).toBe('string');

    const usersAfter = await ctx.prisma.user.count({ where: { email } });
    expect(usersAfter).toBe(1);
  });

  it('logging in twice with the same email reuses the same user', async () => {
    ctx = await buildTestApp();
    const email = 'grace@example.com';
    const first = await devLogin(ctx.app, email);
    const second = await devLogin(ctx.app, email);
    expect(second.userId).toBe(first.userId);
    expect(await ctx.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('GET /auth/me returns the authenticated user when a valid bearer token is presented', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'linus@example.com');

    const res = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me', headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(session.userId);
    expect(body.email).toBe('linus@example.com');
  });

  it('GET /auth/me without a token is rejected with the standard error envelope', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /auth/api-keys mints a key usable via x-api-key for a subsequent request', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app, 'grace2@example.com');

    const createRes = await ctx.app.inject({
      method: 'POST',
      url: '/v1/auth/api-keys',
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { name: 'CI key' },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.key).toMatch(/^gw_live_/);

    const meRes = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me', headers: { 'x-api-key': created.key } });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().id).toBe(session.userId);

    const revokeRes = await ctx.app.inject({
      method: 'DELETE',
      url: `/v1/auth/api-keys/${created.id}`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(revokeRes.statusCode).toBe(204);

    const afterRevoke = await ctx.app.inject({ method: 'GET', url: '/v1/auth/me', headers: { 'x-api-key': created.key } });
    expect(afterRevoke.statusCode).toBe(401);
  });
});
