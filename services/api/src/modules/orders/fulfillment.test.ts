// Route/pipeline-level test (fakePrisma-backed): `fulfillPaidOrder` accrues the correct §4 royalty
// split — creator share = 100 - PLAN[tier].feePct, computed on the *selling creator's* tier — for
// every plan tier, and stamps the same numbers onto the OrderItem. `royalties/split.test.ts`
// already exhaustively covers `computeRoyaltySplit` in isolation; this test exercises the whole
// "order paid -> royalty ledger" pipeline through the real Fastify app + fakePrisma so a
// regression in the wiring (not just the formula) would be caught too.
import { afterEach, describe, expect, it } from 'vitest';
import { PLAN, type PlanTier } from '@sonic-gameworld/world-schema';
import { buildTestApp, type TestApp } from '../../test/helpers.js';
import { fulfillPaidOrder } from './fulfillment.js';

const TIERS: PlanTier[] = ['STARTER', 'CREATOR', 'PRO', 'STUDIO', 'ENTERPRISE'];
const GROSS_CENTS = 10_000;

describe('fulfillPaidOrder: royalty split at each creator plan tier', () => {
  let ctx: TestApp;

  afterEach(async () => {
    await ctx?.close();
  });

  it.each(TIERS)('splits correctly for a %s-tier creator', async (tier) => {
    ctx = await buildTestApp();

    const buyer = await ctx.prisma.user.create({ data: { email: `buyer-${tier}@example.com`, handle: `buyer-${tier}`, displayName: 'Buyer', tier: 'STARTER', roles: ['player'], emailVerified: true } });
    const creatorUser = await ctx.prisma.user.create({ data: { email: `creator-${tier}@example.com`, handle: `creator-${tier}`, displayName: 'Creator', tier, roles: ['owner'], emailVerified: true } });
    const creatorProfile = await ctx.prisma.creatorProfile.create({
      data: { userId: creatorUser.id, handle: `creator-${tier}-profile`, displayName: 'Creator', verified: false, followers: 0, repScore: 50 },
    });
    const product = await ctx.prisma.product.create({
      data: {
        slug: `product-${tier}`,
        name: `Product (${tier})`,
        category: 'SYSTEM',
        genre: [],
        engines: ['WEB'],
        priceCents: GROSS_CENTS,
        currency: 'USD',
        description: 'fixture',
        tags: [],
        previewUrls: [],
        license: { id: 'lic_fixture', commercial: true, personal: true, enterprise: false, redistribution: false, modification: true, multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false },
        refKind: 'SYSTEM',
        refId: 'sys_fixture',
        creatorId: creatorProfile.id,
        status: 'PUBLISHED',
        featured: false,
        rating: 0,
        ratingCount: 0,
        sales: 0,
      },
    });
    const order = await ctx.prisma.order.create({
      data: { buyerId: buyer.id, status: 'PENDING', subtotalCents: GROSS_CENTS, discountCents: 0, taxCents: 0, totalCents: GROSS_CENTS, currency: 'USD', paymentProvider: 'MOCK' },
    });
    const orderItem = await ctx.prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 1, unitPriceCents: GROSS_CENTS, feeCents: 0, royaltyCents: 0 } });

    await fulfillPaidOrder(ctx.app, order.id, { paymentRef: 'test_ref', provider: 'MOCK' });

    const expectedFeePct = PLAN[tier].feePct;
    const expectedFeeCents = Math.round((GROSS_CENTS * expectedFeePct) / 100);
    const expectedRoyaltyCents = GROSS_CENTS - expectedFeeCents;

    const updatedItem = await ctx.prisma.orderItem.findUnique({ where: { id: orderItem.id } });
    expect(updatedItem.feeCents).toBe(expectedFeeCents);
    expect(updatedItem.royaltyCents).toBe(expectedRoyaltyCents);

    const accruals = await ctx.prisma.royaltyAccrual.findMany({ where: { orderItemId: orderItem.id } });
    expect(accruals).toHaveLength(1);
    expect(accruals[0].creatorId).toBe(creatorProfile.id);
    expect(accruals[0].amountCents).toBe(expectedRoyaltyCents);
    expect(accruals[0].status).toBe('ACCRUED');

    const updatedOrder = await ctx.prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder.status).toBe('PAID');
    expect(updatedOrder.paymentRef).toBe('test_ref');
  });

  it('is idempotent: calling it twice for the same order only accrues the royalty once', async () => {
    ctx = await buildTestApp();
    const buyer = await ctx.prisma.user.create({ data: { email: 'buyer-idem@example.com', handle: 'buyer-idem', displayName: 'Buyer', tier: 'STARTER', roles: ['player'], emailVerified: true } });
    const creatorUser = await ctx.prisma.user.create({ data: { email: 'creator-idem@example.com', handle: 'creator-idem', displayName: 'Creator', tier: 'CREATOR', roles: ['owner'], emailVerified: true } });
    const creatorProfile = await ctx.prisma.creatorProfile.create({ data: { userId: creatorUser.id, handle: 'creator-idem-profile', displayName: 'Creator', verified: false, followers: 0, repScore: 50 } });
    const product = await ctx.prisma.product.create({
      data: {
        slug: 'product-idem',
        name: 'Product (idem)',
        category: 'SYSTEM',
        genre: [],
        engines: ['WEB'],
        priceCents: GROSS_CENTS,
        currency: 'USD',
        description: 'fixture',
        tags: [],
        previewUrls: [],
        license: { id: 'lic_fixture', commercial: true, personal: true, enterprise: false, redistribution: false, modification: true, multiplayer: true, aiTraining: false, resale: false, sublicensing: false, attribution: false },
        refKind: 'SYSTEM',
        refId: 'sys_fixture',
        creatorId: creatorProfile.id,
        status: 'PUBLISHED',
        featured: false,
        rating: 0,
        ratingCount: 0,
        sales: 0,
      },
    });
    const order = await ctx.prisma.order.create({ data: { buyerId: buyer.id, status: 'PENDING', subtotalCents: GROSS_CENTS, discountCents: 0, taxCents: 0, totalCents: GROSS_CENTS, currency: 'USD', paymentProvider: 'MOCK' } });
    const orderItem = await ctx.prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, quantity: 1, unitPriceCents: GROSS_CENTS, feeCents: 0, royaltyCents: 0 } });

    await fulfillPaidOrder(ctx.app, order.id, { paymentRef: 'ref1', provider: 'MOCK' });
    const second = await fulfillPaidOrder(ctx.app, order.id, { paymentRef: 'ref2', provider: 'MOCK' });
    expect(second.alreadyPaid).toBe(true);

    const accruals = await ctx.prisma.royaltyAccrual.findMany({ where: { orderItemId: orderItem.id } });
    expect(accruals).toHaveLength(1);
  });
});
