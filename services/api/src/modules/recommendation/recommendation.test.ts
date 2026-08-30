// Route-level tests for /recommendations and /recommendations/similar/:productId. The ranking
// *formula* is exhaustively covered by rank.test.ts; these tests exercise the policy in
// index.ts — purchase history -> genre affinity, and the tag/genre-overlap similarity fallback
// (no embeddings populated under fakePrisma, since $queryRaw always returns `[]`).
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

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
      category: 'ENVIRONMENT',
      genre: ['FANTASY'],
      engines: ['WEB'],
      priceCents: 1000,
      currency: 'USD',
      description: 'fixture',
      tags: ['dragons', 'castle'],
      previewUrls: [],
      license: { id: 'lic_x', commercial: true, personal: true, enterprise: false, redistribution: false, modification: true, multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false },
      refKind: 'ASSET',
      refId: 'asset_fixture',
      creatorId: creatorProfile.id,
      status: 'PUBLISHED',
      featured: false,
      rating: 4,
      ratingCount: 10,
      sales: 5,
      publishedAt: new Date(),
      ...overrides,
    },
  });
}

describe('GET /recommendations', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('ranks a genre matching the buyer\'s purchase history above an unrelated one', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);

    const fantasyProduct = await seedProduct(ctx, { genre: ['FANTASY'], slug: 'fantasy-owned' });
    const order = await ctx.prisma.order.create({ data: { buyerId: session.userId, status: 'PAID', subtotalCents: 1000, discountCents: 0, taxCents: 0, totalCents: 1000, currency: 'USD', paymentProvider: 'MOCK', paidAt: new Date() } });
    await ctx.prisma.orderItem.create({ data: { orderId: order.id, productId: fantasyProduct.id, quantity: 1, unitPriceCents: 1000 } });

    const fantasyCandidate = await seedProduct(ctx, { genre: ['FANTASY'], slug: 'fantasy-candidate', sales: 1, rating: 3, ratingCount: 2 });
    const scifiCandidate = await seedProduct(ctx, { genre: ['SCIFI'], slug: 'scifi-candidate', sales: 1, rating: 3, ratingCount: 2 });

    const res = await ctx.app.inject({ method: 'GET', url: '/v1/recommendations', headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(fantasyProduct.id); // already purchased -> excluded
    expect(ids.indexOf(fantasyCandidate.id)).toBeLessThan(ids.indexOf(scifiCandidate.id));
  });

  it('requires authentication', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/recommendations' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /recommendations/similar/:productId', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('falls back to tag/genre overlap and ranks the closer match first', async () => {
    ctx = await buildTestApp();
    const target = await seedProduct(ctx, { tags: ['dragons', 'castle'], genre: ['FANTASY'], category: 'ENVIRONMENT', slug: 'target' });
    const closeMatch = await seedProduct(ctx, { tags: ['dragons', 'castle'], genre: ['FANTASY'], category: 'ENVIRONMENT', slug: 'close-match' });
    // Different category too, so the category-match bonus in tagGenreOverlapScore doesn't leak a
    // nonzero score in from zero tag/genre overlap alone.
    const farMatch = await seedProduct(ctx, { tags: ['spaceship'], genre: ['SCIFI'], category: 'VEHICLE', slug: 'far-match' });

    const res = await ctx.app.inject({ method: 'GET', url: `/v1/recommendations/similar/${target.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.method).toBe('TAG_OVERLAP');
    const ids = body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(closeMatch.id);
    expect(ids).not.toContain(farMatch.id); // zero overlap -> filtered out
  });

  it('404s for an unknown product', async () => {
    ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/recommendations/similar/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
