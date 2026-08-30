// Route-level test for GET /search: the plain-filter path (no `q`) queries Postgres/fakePrisma
// directly; this covers category/genre/engine filtering without depending on OpenSearch/the ILIKE
// SearchDocument mirror being populated.
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../../test/helpers.js';

async function seedProduct(ctx: TestApp, overrides: Record<string, unknown> = {}) {
  const creatorUser = await ctx.prisma.user.create({
    data: { email: `creator-${Math.random().toString(36).slice(2)}@example.com`, handle: `creator-${Math.random().toString(36).slice(2, 8)}`, displayName: 'Creator', tier: 'CREATOR', roles: ['owner'], emailVerified: true },
  });
  const creatorProfile = await ctx.prisma.creatorProfile.create({
    data: { userId: creatorUser.id, handle: `profile-${Math.random().toString(36).slice(2, 8)}`, displayName: 'Creator', verified: false, followers: 0, repScore: 60 },
  });
  return ctx.prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Fixture Product',
      category: 'VEHICLE',
      genre: ['RACING'],
      engines: ['UNREAL'],
      priceCents: 1000,
      currency: 'USD',
      description: 'fixture',
      tags: [],
      previewUrls: [],
      license: { id: 'lic_x', commercial: true, personal: true, enterprise: false, redistribution: false, modification: true, multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false },
      refKind: 'ASSET',
      refId: 'asset_fixture',
      creatorId: creatorProfile.id,
      status: 'PUBLISHED',
      featured: false,
      rating: 0,
      ratingCount: 0,
      sales: 0,
      publishedAt: new Date(),
      ...overrides,
    },
  });
}

describe('GET /search', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('filters by category, genre, and engine (array-field JS filtering, not a DB `has` operator)', async () => {
    ctx = await buildTestApp();
    const match = await seedProduct(ctx, { category: 'VEHICLE', genre: ['RACING'], engines: ['UNREAL'] });
    await seedProduct(ctx, { category: 'VEHICLE', genre: ['SHOOTER'], engines: ['UNREAL'] }); // wrong genre
    await seedProduct(ctx, { category: 'CHARACTER', genre: ['RACING'], engines: ['UNREAL'] }); // wrong category
    await seedProduct(ctx, { category: 'VEHICLE', genre: ['RACING'], engines: ['GODOT'] }); // wrong engine, no WEB fallback

    const res = await ctx.app.inject({ method: 'GET', url: '/v1/search?category=VEHICLE&genre=RACING&engine=UNREAL' });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).toEqual([match.id]);

    const res2 = await ctx.app.inject({ method: 'GET', url: '/v1/search?category=VEHICLE&genre=RACING' });
    expect(res2.json().items).toHaveLength(2); // both engines match sans the engine= filter
  });

  it('excludes unpublished and deleted products', async () => {
    ctx = await buildTestApp();
    await seedProduct(ctx, { status: 'DRAFT' });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/search' });
    expect(res.json().items).toHaveLength(0);
  });
});
