// Route-level tests for the marketplace module: wishlist, cart, reviews (verified-purchase
// detection + one-review-per-author), and the map/featured/search read endpoints.
import { afterEach, describe, expect, it } from 'vitest';
import { buildTestApp, devLogin, type TestApp } from '../../test/helpers.js';

async function seedProduct(ctx: TestApp, overrides: Record<string, unknown> = {}) {
  const creatorUser = await ctx.prisma.user.create({
    data: { email: `creator-${Math.random().toString(36).slice(2)}@example.com`, handle: `creator-${Math.random().toString(36).slice(2, 8)}`, displayName: 'Creator', tier: 'CREATOR', roles: ['owner'], emailVerified: true },
  });
  const creatorProfile = await ctx.prisma.creatorProfile.create({
    data: { userId: creatorUser.id, handle: `profile-${Math.random().toString(36).slice(2, 8)}`, displayName: 'Creator', verified: false, followers: 0, repScore: 60 },
  });
  const product = await ctx.prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Neon City Kit',
      category: 'ENVIRONMENT',
      genre: ['CYBERPUNK'],
      engines: ['WEB', 'UNITY'],
      priceCents: 1500,
      currency: 'USD',
      description: 'A neon-soaked city environment kit.',
      tags: ['cyberpunk', 'city'],
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
  return { product, creatorProfile, creatorUser };
}

describe('marketplace: wishlist', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('adds a product, lists it, and is idempotent on a repeat add', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const { product } = await seedProduct(ctx);

    const add1 = await ctx.app.inject({ method: 'POST', url: '/v1/wishlist', headers: { authorization: `Bearer ${session.accessToken}` }, payload: { productId: product.id } });
    expect(add1.statusCode).toBe(201);

    const add2 = await ctx.app.inject({ method: 'POST', url: '/v1/wishlist', headers: { authorization: `Bearer ${session.accessToken}` }, payload: { productId: product.id } });
    expect(add2.statusCode).toBe(200); // already present, not duplicated
    expect(await ctx.prisma.wishlistItem.count({ where: { userId: session.userId, productId: product.id } })).toBe(1);

    const list = await ctx.app.inject({ method: 'GET', url: '/v1/wishlist', headers: { authorization: `Bearer ${session.accessToken}` } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].product.id).toBe(product.id);
  });
});

describe('marketplace: cart', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('adds items, merges a repeat add of the same product, and removes an item', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const { product } = await seedProduct(ctx);
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const add1 = await ctx.app.inject({ method: 'POST', url: '/v1/cart/items', headers: auth, payload: { productId: product.id, quantity: 2 } });
    expect(add1.statusCode).toBe(201);
    expect(add1.json().subtotalCents).toBe(3000);

    const add2 = await ctx.app.inject({ method: 'POST', url: '/v1/cart/items', headers: auth, payload: { productId: product.id, quantity: 1 } });
    expect(add2.json().items).toHaveLength(1);
    expect(add2.json().items[0].quantity).toBe(3);
    expect(add2.json().subtotalCents).toBe(4500);

    const cartItemId = add2.json().items[0].id as string;
    const removed = await ctx.app.inject({ method: 'DELETE', url: `/v1/cart/items/${cartItemId}`, headers: auth });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().items).toHaveLength(0);
  });

  it('rejects adding a non-published product to the cart', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const { product } = await seedProduct(ctx, { status: 'DRAFT' });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/cart/items', headers: { authorization: `Bearer ${session.accessToken}` }, payload: { productId: product.id, quantity: 1 } });
    expect(res.statusCode).toBe(400);
  });
});

describe('marketplace: reviews', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('marks a review verified when the author has a paid order for the product, and blocks a second review', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const { product } = await seedProduct(ctx);
    const auth = { authorization: `Bearer ${session.accessToken}` };

    const order = await ctx.prisma.order.create({ data: { buyerId: session.userId, status: 'PAID', subtotalCents: 1500, discountCents: 0, taxCents: 0, totalCents: 1500, currency: 'USD', paymentProvider: 'MOCK', paidAt: new Date() } });
    await ctx.prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 1, unitPriceCents: 1500 } });

    const res = await ctx.app.inject({ method: 'POST', url: `/v1/products/${product.id}/reviews`, headers: auth, payload: { rating: 5, body: 'Absolutely fantastic environment kit, saved me weeks of work.' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().verifiedPurchase).toBe(true);

    const updatedProduct = await ctx.prisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct.rating).toBe(5);
    expect(updatedProduct.ratingCount).toBe(1);

    const again = await ctx.app.inject({ method: 'POST', url: `/v1/products/${product.id}/reviews`, headers: auth, payload: { rating: 4, body: 'Trying to review twice.' } });
    expect(again.statusCode).toBe(409);

    const list = await ctx.app.inject({ method: 'GET', url: `/v1/products/${product.id}/reviews` });
    expect(list.json().items).toHaveLength(1);
  });

  it('marks a review unverified with no matching paid order', async () => {
    ctx = await buildTestApp();
    const session = await devLogin(ctx.app);
    const { product } = await seedProduct(ctx);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/v1/products/${product.id}/reviews`,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: { rating: 3, body: 'Never actually bought this one, just poking around.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().verifiedPurchase).toBe(false);
  });
});

describe('marketplace: discovery reads', () => {
  let ctx: TestApp;
  afterEach(async () => {
    await ctx?.close();
  });

  it('GET /marketplace/map places a published ASSET-kind product under ASSETS -> its genre', async () => {
    ctx = await buildTestApp();
    await seedProduct(ctx);
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/marketplace/map' });
    expect(res.statusCode).toBe(200);
    const assets = res.json().buckets.find((b: { bucket: string }) => b.bucket === 'ASSETS');
    expect(assets.count).toBeGreaterThanOrEqual(1);
    expect(assets.genres.some((g: { genre: string }) => g.genre === 'CYBERPUNK')).toBe(true);
  });

  it('GET /marketplace/featured only returns featured products', async () => {
    ctx = await buildTestApp();
    const { product: featured } = await seedProduct(ctx, { featured: true });
    await seedProduct(ctx, { featured: false });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/marketplace/featured' });
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).toContain(featured.id);
    expect(ids).toHaveLength(1);
  });

  it('GET /marketplace/search filters by category without a text query', async () => {
    ctx = await buildTestApp();
    const { product } = await seedProduct(ctx, { category: 'ENVIRONMENT' });
    await seedProduct(ctx, { category: 'VEHICLE' });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/marketplace/search?category=ENVIRONMENT' });
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).toContain(product.id);
    expect(ids).toHaveLength(1);
  });
});
