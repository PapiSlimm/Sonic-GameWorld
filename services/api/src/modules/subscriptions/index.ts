// subscriptions module (§9, §4 plan tiers): tier change (Stripe subscription checkout or an
// instant Mock activation), `GET /subscriptions/me`, `DELETE /subscriptions/me`, and the "quota
// hooks" that block a downgrade a creator's current usage no longer fits.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PLAN, PLAN_TIERS, type PlanTier } from '@sonic-gameworld/world-schema';
import { AppError } from '../../errors.js';
import { resolvePaymentProvider } from '../payments/provider.js';

const ChangeTierSchema = z.object({
  tier: z.enum(PLAN_TIERS as [PlanTier, ...PlanTier[]]),
  provider: z.enum(['STRIPE', 'MOCK']).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSubscription(sub: any) {
  return {
    id: sub.id,
    userId: sub.userId,
    tier: sub.tier,
    status: sub.status,
    priceCents: sub.priceCents,
    currency: sub.currency,
    interval: sub.interval,
    currentPeriodStart: new Date(sub.currentPeriodStart).toISOString(),
    currentPeriodEnd: new Date(sub.currentPeriodEnd).toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    provider: sub.provider,
  };
}

function virtualStarterSubscription(userId: string) {
  const now = new Date();
  return {
    id: `virtual_${userId}`,
    userId,
    tier: 'STARTER' as PlanTier,
    status: 'ACTIVE',
    priceCents: 0,
    currency: 'USD',
    interval: 'MONTH',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + PERIOD_MS),
    cancelAtPeriodEnd: false,
    provider: 'MOCK',
  };
}

/** "Quota hooks": refuse a downgrade whose new tier can't fit the creator's current usage. Skips
 * team-quota checking when the user has no org (assertTeamQuota needs an orgId). */
async function assertDowngradeFits(app: FastifyInstance, userId: string, orgId: string | null | undefined, newTier: PlanTier): Promise<void> {
  await app.quotas.assertProjectQuota(userId, newTier);
  await app.quotas.assertAssetQuota(userId, newTier);
  if (orgId) await app.quotas.assertTeamQuota(orgId, newTier);
}

/** Called from payments/index.ts's Stripe webhook (`checkout.session.completed`, mode=subscription). */
export async function activateSubscriptionFromWebhook(app: FastifyInstance, userId: string, tier: string, providerRef: string): Promise<void> {
  const resolvedTier = (PLAN_TIERS as readonly string[]).includes(tier) ? (tier as PlanTier) : 'CREATOR';
  const now = new Date();
  const existing = await app.db.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  if (existing) {
    await app.db.subscription.update({
      where: { id: existing.id },
      data: { tier: resolvedTier, status: 'ACTIVE', priceCents: PLAN[resolvedTier].priceUsd * 100, provider: 'STRIPE', providerRef, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + PERIOD_MS), cancelAtPeriodEnd: false },
    });
  } else {
    await app.db.subscription.create({
      data: { userId, tier: resolvedTier, status: 'ACTIVE', priceCents: PLAN[resolvedTier].priceUsd * 100, currency: 'USD', interval: 'MONTH', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + PERIOD_MS), provider: 'STRIPE', providerRef },
    });
  }
  await app.db.user.update({ where: { id: userId }, data: { tier: resolvedTier } });
}

export async function registerSubscriptionsModule(app: FastifyInstance): Promise<void> {
  // POST /subscriptions — change (or start) the caller's plan tier.
  app.post('/subscriptions', { preHandler: [app.authenticate] }, async (request) => {
    const body = ChangeTierSchema.parse(request.body);
    const userId = request.user!.userId;
    const user = await app.db.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.notFound('User');

    const currentTierIndex = PLAN_TIERS.indexOf(user.tier as PlanTier);
    const newTierIndex = PLAN_TIERS.indexOf(body.tier);
    if (newTierIndex < currentTierIndex) {
      await assertDowngradeFits(app, userId, user.orgId, body.tier);
    }

    const provider = resolvePaymentProvider(app.config, body.provider);
    const priceCents = PLAN[body.tier].priceUsd * 100;

    if (priceCents === 0) {
      // Free tier: no payment needed at all, activate immediately regardless of provider.
      const now = new Date();
      const existing = await app.db.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      const data = { tier: body.tier, status: 'ACTIVE' as const, priceCents, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + PERIOD_MS), provider: 'MOCK' as const, cancelAtPeriodEnd: false };
      const sub = existing ? await app.db.subscription.update({ where: { id: existing.id }, data }) : await app.db.subscription.create({ data: { userId, currency: 'USD', interval: 'MONTH', ...data } });
      await app.db.user.update({ where: { id: userId }, data: { tier: body.tier } });
      return { status: 'ACTIVE', subscription: serializeSubscription(sub) };
    }

    const result = await provider.createSubscriptionCheckout({
      userId,
      tier: body.tier,
      priceCents,
      currency: 'USD',
      buyerEmail: user.email,
      successUrl: body.successUrl ?? `${app.config.baseUrl}/billing/success`,
      cancelUrl: body.cancelUrl ?? `${app.config.baseUrl}/billing/cancel`,
    });

    if (result.immediateActive) {
      await activateSubscriptionFromWebhook(app, userId, body.tier, result.sessionId);
      const sub = await app.db.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      return { status: 'ACTIVE', subscription: sub ? serializeSubscription(sub) : null };
    }

    // Stripe path: park an INCOMPLETE row now so GET /subscriptions/me can show "pending" state;
    // the webhook (checkout.session.completed) flips it to ACTIVE + updates User.tier.
    await app.db.subscription.create({
      data: { userId, tier: body.tier, status: 'INCOMPLETE', priceCents, currency: 'USD', interval: 'MONTH', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + PERIOD_MS), provider: 'STRIPE', providerRef: result.sessionId },
    });
    return { status: 'PENDING', provider: result.provider, sessionId: result.sessionId, checkoutUrl: result.checkoutUrl };
  });

  // GET /subscriptions/me
  app.get('/subscriptions/me', { preHandler: [app.authenticate] }, async (request) => {
    const sub = await app.db.subscription.findFirst({ where: { userId: request.user!.userId, status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' } });
    return serializeSubscription(sub ?? virtualStarterSubscription(request.user!.userId));
  });

  // DELETE /subscriptions/me — cancel. Mock deactivates immediately (reverting to STARTER); Stripe
  // marks cancel-at-period-end (actual downgrade follows once the period lapses, via a
  // `customer.subscription.deleted` webhook this pass does not yet handle — see README).
  app.delete('/subscriptions/me', { preHandler: [app.authenticate] }, async (request) => {
    const userId = request.user!.userId;
    const sub = await app.db.subscription.findFirst({ where: { userId, status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] } }, orderBy: { createdAt: 'desc' } });
    if (!sub) return { status: 'NONE' };

    if (sub.provider === 'STRIPE' && sub.providerRef && app.config.stripe.secretKey) {
      try {
        const { default: StripeCtor } = (await import('stripe')) as unknown as { default: new (key: string) => { subscriptions: { update: (id: string, opts: Record<string, unknown>) => Promise<unknown> } } };
        const stripe = new StripeCtor(app.config.stripe.secretKey);
        await stripe.subscriptions.update(sub.providerRef, { cancel_at_period_end: true });
      } catch (err) {
        request.log.warn({ err }, 'stripe subscription cancel failed (marking cancelAtPeriodEnd locally regardless)');
      }
      const updated = await app.db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
      return { status: 'CANCEL_AT_PERIOD_END', subscription: serializeSubscription(updated) };
    }

    const updated = await app.db.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelAtPeriodEnd: true } });
    await app.db.user.update({ where: { id: userId }, data: { tier: 'STARTER' } });
    return { status: 'CANCELLED', subscription: serializeSubscription(updated) };
  });
}
