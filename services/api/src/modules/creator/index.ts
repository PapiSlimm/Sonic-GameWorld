// creator module (§9, §14): Creator Passport, dashboard, reputation, balance, payouts.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { computeCreatorScore, gatherReputationInputs } from './reputation.js';
import { processPayout } from './payouts.js';

const CreatorPatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(2000).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  socials: z.record(z.string()).optional(),
});

const RequestPayoutSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  method: z.enum(['STRIPE_CONNECT', 'MANUAL']).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProfile(profile: any, productCount: number) {
  return {
    id: profile.id,
    userId: profile.userId,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    bannerUrl: profile.bannerUrl ?? null,
    website: profile.website ?? null,
    socials: profile.socials ?? undefined,
    verified: profile.verified,
    followers: profile.followers,
    productCount,
    createdAt: profile.createdAt.toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeReputation(profile: any) {
  return {
    score: profile.repScore,
    quality: profile.repQuality,
    reliability: profile.repReliability,
    sales: profile.repSales,
    updates: profile.repUpdates,
    reviews: profile.repReviews,
    support: profile.repSupport,
    originality: profile.repOriginality,
    compliance: profile.repCompliance,
    computedAt: (profile.repComputedAt instanceof Date ? profile.repComputedAt : new Date(profile.repComputedAt)).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializePayout(payout: any) {
  return {
    id: payout.id,
    creatorId: payout.creatorId,
    amountCents: payout.amountCents,
    currency: payout.currency,
    status: payout.status,
    provider: payout.provider,
    providerRef: payout.providerRef ?? null,
    requestedAt: (payout.requestedAt instanceof Date ? payout.requestedAt : new Date(payout.requestedAt)).toISOString(),
    sentAt: payout.sentAt ? (payout.sentAt instanceof Date ? payout.sentAt : new Date(payout.sentAt)).toISOString() : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeProductSummary(product: any, profile: any) {
  const license = (product.license ?? {}) as { commercial?: boolean; multiplayer?: boolean; attribution?: boolean };
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    genre: product.genre,
    engines: product.engines,
    priceCents: product.priceCents,
    currency: product.currency,
    thumbnailUrl: product.thumbnailUrl ?? null,
    rating: product.rating,
    ratingCount: product.ratingCount,
    sales: product.sales,
    creator: { id: profile.id, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null, verified: profile.verified },
    licenseSummary: {
      commercial: license.commercial ?? false,
      multiplayer: license.multiplayer ?? false,
      attribution: license.attribution ?? false,
    },
    status: product.status,
    featured: product.featured,
    publishedAt: product.publishedAt ? new Date(product.publishedAt).toISOString() : null,
  };
}

export async function registerCreatorModule(app: FastifyInstance): Promise<void> {
  async function getOrCreateOwnProfile(userId: string) {
    let profile = await app.db.creatorProfile.findUnique({ where: { userId } });
    if (!profile) {
      const user = await app.db.user.findUnique({ where: { id: userId } });
      if (!user) throw AppError.notFound('User');
      profile = await app.db.creatorProfile.create({
        data: {
          userId,
          handle: user.handle,
          displayName: user.displayName,
          verified: false,
          followers: 0,
          repScore: 0,
          repQuality: 0,
          repReliability: 0,
          repSales: 0,
          repUpdates: 0,
          repReviews: 0,
          repSupport: 0,
          repOriginality: 0,
          repCompliance: 0,
          repComputedAt: new Date(),
        },
      });
      await app.bus.publish(createEvent({ type: 'CREATOR_ACTIVATED', payload: { userId, creatorId: profile.id, handle: profile.handle } }));
    }
    return profile;
  }

  // GET /creators/:handle — public Creator Passport.
  app.get('/creators/:handle', async (request) => {
    const { handle } = request.params as { handle: string };
    const profile = await app.db.creatorProfile.findUnique({ where: { handle } });
    if (!profile || profile.deletedAt) throw AppError.notFound('Creator', handle);

    const allProducts = await app.db.product.findMany({ where: { creatorId: profile.id } });
    const published = allProducts.filter((p: { status: string }) => p.status === 'PUBLISHED');
    const totalSales = published.reduce((sum: number, p: { sales: number }) => sum + p.sales, 0);
    const rated = published.filter((p: { ratingCount: number }) => p.ratingCount > 0);
    const averageRating = rated.length > 0 ? rated.reduce((sum: number, p: { rating: number }) => sum + p.rating, 0) / rated.length : 0;
    const ratingCount = published.reduce((sum: number, p: { ratingCount: number }) => sum + p.ratingCount, 0);
    const featured = published.filter((p: { featured: boolean }) => p.featured).slice(0, 6);

    const badges: string[] = [];
    if (profile.verified) badges.push('VERIFIED');
    if (totalSales >= 100) badges.push('TOP_SELLER');
    if (profile.repScore >= 90) badges.push('ELITE');

    return {
      profile: serializeProfile(profile, allProducts.length),
      reputation: serializeReputation(profile),
      badges,
      stats: {
        totalSales,
        totalRevenueCents: 0, // exact revenue attribution is owned by the marketplace/orders module
        averageRating: Math.round(averageRating * 10) / 10,
        ratingCount,
      },
      featuredProducts: featured.map((p: unknown) => serializeProductSummary(p, profile)),
    };
  });

  // PATCH /creators/me — update the caller's own creator profile (creating it on first use).
  app.patch('/creators/me', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const body = CreatorPatchSchema.parse(request.body ?? {});
    const updated = await app.db.creatorProfile.update({ where: { id: profile.id }, data: body });
    const productCount = await app.db.product.count({ where: { creatorId: profile.id } });
    return serializeProfile(updated, productCount);
  });

  // GET /creators/me/dashboard — sales/revenue/reputation overview.
  app.get('/creators/me/dashboard', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const products = await app.db.product.findMany({ where: { creatorId: profile.id } });
    const productIds = products.map((p: { id: string }) => p.id);

    const totalSales = products.reduce((sum: number, p: { sales: number }) => sum + p.sales, 0);
    const rated = products.filter((p: { ratingCount: number }) => p.ratingCount > 0);
    const averageRating = rated.length > 0 ? rated.reduce((sum: number, p: { rating: number }) => sum + p.rating, 0) / rated.length : 0;

    const orderItems = productIds.length > 0 ? await app.db.orderItem.findMany({ where: { productId: { in: productIds } } }) : [];
    const revenueCents = orderItems.reduce(
      (sum: number, oi: { unitPriceCents: number; quantity: number; feeCents: number }) => sum + oi.unitPriceCents * oi.quantity - oi.feeCents,
      0,
    );

    const accrued = await app.db.royaltyAccrual.aggregate({ where: { creatorId: profile.id, status: 'ACCRUED' }, _sum: { amountCents: true } });
    const pendingPayoutCents = accrued._sum?.amountCents ?? 0;

    const topProducts = [...products]
      .sort((a: { sales: number }, b: { sales: number }) => b.sales - a.sales)
      .slice(0, 5)
      .map((p: { id: string; sales: number }) => ({ ...serializeProductSummary(p, profile), sales: p.sales, revenueCents: 0 }));

    return {
      revenueCents,
      revenueDeltaPct: 0,
      sales: totalSales,
      salesDeltaPct: 0,
      followers: profile.followers,
      averageRating: Math.round(averageRating * 10) / 10,
      reputation: serializeReputation(profile),
      timeseries: [] as { date: string; revenueCents: number; sales: number; views: number }[],
      topProducts,
      pendingPayoutCents,
    };
  });

  // GET /creators/me/reputation — recompute (§14) + persist the cached breakdown.
  app.get('/creators/me/reputation', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const inputs = await gatherReputationInputs(app.db, profile.id);
    const breakdown = computeCreatorScore(inputs);
    const updated = await app.db.creatorProfile.update({
      where: { id: profile.id },
      data: {
        repScore: breakdown.score,
        repQuality: breakdown.quality,
        repReliability: breakdown.reliability,
        repSales: breakdown.sales,
        repUpdates: breakdown.updates,
        repReviews: breakdown.reviews,
        repSupport: breakdown.support,
        repOriginality: breakdown.originality,
        repCompliance: breakdown.compliance,
        repComputedAt: new Date(breakdown.computedAt),
      },
    });
    return serializeReputation(updated);
  });

  // GET /creators/me/balance
  app.get('/creators/me/balance', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const [accruedAgg, pendingAgg, sentAgg] = await Promise.all([
      app.db.royaltyAccrual.aggregate({ where: { creatorId: profile.id, status: 'ACCRUED' }, _sum: { amountCents: true } }),
      app.db.payout.aggregate({ where: { creatorId: profile.id, status: { in: ['REQUESTED', 'PROCESSING'] } }, _sum: { amountCents: true } }),
      app.db.payout.aggregate({ where: { creatorId: profile.id, status: 'SENT' }, _sum: { amountCents: true } }),
    ]);
    const accruedCents = accruedAgg._sum?.amountCents ?? 0;
    const pendingCents = pendingAgg._sum?.amountCents ?? 0;
    const lifetimeCents = sentAgg._sum?.amountCents ?? 0;
    return { availableCents: Math.max(0, accruedCents - pendingCents), pendingCents, lifetimeCents, currency: 'USD', nextPayoutAt: null };
  });

  // POST /creators/me/payouts — request a payout of some/all of the available balance.
  app.post('/creators/me/payouts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const body = RequestPayoutSchema.parse(request.body ?? {});

    const [accruedAgg, pendingAgg] = await Promise.all([
      app.db.royaltyAccrual.aggregate({ where: { creatorId: profile.id, status: 'ACCRUED' }, _sum: { amountCents: true } }),
      app.db.payout.aggregate({ where: { creatorId: profile.id, status: { in: ['REQUESTED', 'PROCESSING'] } }, _sum: { amountCents: true } }),
    ]);
    const availableCents = Math.max(0, (accruedAgg._sum?.amountCents ?? 0) - (pendingAgg._sum?.amountCents ?? 0));
    const amountCents = body.amountCents ?? availableCents;
    if (amountCents <= 0) throw AppError.badRequest('No available balance to pay out');
    if (amountCents > availableCents) {
      throw AppError.badRequest(`Requested amount (${amountCents}c) exceeds available balance (${availableCents}c)`, { availableCents });
    }

    const provider = body.method === 'MANUAL' ? 'MANUAL' : 'STRIPE_CONNECT';
    let payout = await app.db.payout.create({
      data: { creatorId: profile.id, amountCents, currency: 'USD', status: 'REQUESTED', provider, requestedAt: new Date() },
    });
    await app.bus.publish(createEvent({ type: 'PAYOUT_REQUESTED', payload: { payoutId: payout.id, creatorId: profile.id, amountCents } }));

    if (body.method !== 'MANUAL') {
      const result = await processPayout(app.config, {
        payoutId: payout.id,
        creatorId: profile.id,
        amountCents,
        currency: 'USD',
        stripeAccountId: profile.stripeAccountId,
      });
      payout = await app.db.payout.update({
        where: { id: payout.id },
        data: { status: result.status, providerRef: result.providerRef ?? null, sentAt: result.status === 'SENT' ? new Date() : null },
      });
      if (result.status === 'SENT') {
        await app.bus.publish(
          createEvent({ type: 'PAYOUT_SENT', payload: { payoutId: payout.id, creatorId: profile.id, amountCents, providerRef: result.providerRef ?? '' } }),
        );
      }
    }

    reply.status(201);
    return serializePayout(payout);
  });

  // GET /creators/me/payouts
  app.get('/creators/me/payouts', { preHandler: [app.authenticate] }, async (request) => {
    const profile = await getOrCreateOwnProfile(request.user!.userId);
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = await app.db.payout.findMany({ where: { creatorId: profile.id }, orderBy: { requestedAt: 'desc' }, ...toPrismaPageArgs(query) });
    return toPage(rows.map(serializePayout), query);
  });
}
