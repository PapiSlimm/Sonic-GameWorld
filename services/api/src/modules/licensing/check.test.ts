// Route-level test for POST /licenses/check: drives the §6 compatibility engine end-to-end
// through real product listings (STANDARD vs. PERSONAL presets) against fakePrisma, hitting all
// three §6 verdicts (GREEN/YELLOW/RED).
import { afterEach, describe, expect, it } from 'vitest';
import { signAccessToken } from '../../plugins/auth.js';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

async function createProduct(ctx: TestApp, token: string, licensePreset: 'STANDARD' | 'PERSONAL') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/v1/products',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: `Test Product ${licensePreset} ${Math.random().toString(36).slice(2, 8)}`,
      category: 'SYSTEM',
      engines: ['WEB'],
      priceCents: 999,
      description: 'A product used purely to exercise the license-compatibility engine.',
      refKind: 'SYSTEM',
      refId: 'sys_license_check_fixture',
      license: { preset: licensePreset },
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string };
}

describe('POST /licenses/check', () => {
  let ctx: TestApp;

  afterEach(async () => {
    await ctx?.close();
  });

  it('returns GREEN when every license permits the requested use with no caveats', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const token = signAccessToken({ userId: session.userId, roles: ['owner'], tier: 'CREATOR' }, ctx.app.config);
    const product = await createProduct(ctx, token, 'STANDARD');

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/licenses/check',
      payload: { productIds: [product.id], intent: { commercial: true, multiplayer: true, redistribute: false, modify: true } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('GREEN');
  });

  it('returns YELLOW when a permitted use still carries an attribution caveat', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const token = signAccessToken({ userId: session.userId, roles: ['owner'], tier: 'CREATOR' }, ctx.app.config);
    const product = await createProduct(ctx, token, 'PERSONAL'); // PERSONAL preset requires attribution

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/licenses/check',
      payload: { productIds: [product.id], intent: { commercial: false, multiplayer: false, redistribute: false, modify: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('YELLOW');
    expect(body.reasons.join(' ')).toMatch(/attribution/i);
  });

  it('returns RED when the requested use is hard-blocked (redistribution not permitted)', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const token = signAccessToken({ userId: session.userId, roles: ['owner'], tier: 'CREATOR' }, ctx.app.config);
    const product = await createProduct(ctx, token, 'STANDARD'); // STANDARD preset: redistribution: false

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/licenses/check',
      payload: { productIds: [product.id], intent: { commercial: true, multiplayer: true, redistribute: true, modify: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('RED');
    expect(body.reasons.join(' ')).toMatch(/redistribution/i);
  });

  it('requires at least one of `licenses` or `productIds`', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/licenses/check', payload: { intent: { commercial: true, multiplayer: true, redistribute: false, modify: true } } });
    expect(res.statusCode).toBe(400);
  });
});
