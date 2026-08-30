// payments module (§9): `POST /payments/checkout` (Stripe Checkout Session, or an instant
// MockProvider success) and `POST /payments/webhook` (Stripe signature verification -> order/
// subscription fulfillment). Subscription checkout is *initiated* here too (shared plumbing with
// order checkout) but the subscription row itself is owned by `../subscriptions/index.ts`, which
// this module calls into on webhook completion — see `activateSubscriptionFromWebhook` there.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { computePaymentRiskScore, raiseFraudSignal } from '../moderation/fraud.js';
import { fulfillPaidOrder } from '../orders/fulfillment.js';
import { MockProvider, resolvePaymentProvider, verifyStripeWebhook, type PaymentProviderName } from './provider.js';

const CheckoutBodySchema = z.object({
  orderId: z.string(),
  provider: z.enum(['STRIPE', 'MOCK']).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

async function assessCheckoutRisk(app: FastifyInstance, buyerId: string, orderId: string, amountCents: number): Promise<void> {
  try {
    const buyer = await app.db.user.findUnique({ where: { id: buyerId } });
    if (!buyer) return;
    const accountAgeHours = (Date.now() - new Date(buyer.createdAt).getTime()) / (1000 * 60 * 60);
    const pastOrders = (await app.db.order.findMany({ where: { buyerId, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } })) as Array<{ totalCents: number }>;
    const buyerAvgOrderCents = pastOrders.length > 0 ? pastOrders.reduce((s, o) => s + o.totalCents, 0) / pastOrders.length : 0;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOrders = (await app.db.order.findMany({ where: { buyerId, createdAt: { gte: dayAgo } } })) as unknown[];
    const recentPayments = (await app.db.payment.findMany({ where: { status: 'FAILED', createdAt: { gte: dayAgo } } })) as Array<{ orderId: string | null }>;
    const failedPaymentsInLast24h = recentPayments.filter((p) => p.orderId).length;

    const risk = computePaymentRiskScore({ accountAgeHours, orderAmountCents: amountCents, buyerAvgOrderCents, ordersInLast24h: recentOrders.length, failedPaymentsInLast24h });
    if (risk.risky) {
      await raiseFraudSignal(app, { userId: buyerId, orderId, result: risk, refKind: 'USER', refId: buyerId });
    }
  } catch (err) {
    app.log.warn({ err }, 'payment risk assessment failed (non-blocking)');
  }
}

export async function registerPaymentsModule(app: FastifyInstance): Promise<void> {
  // POST /payments/checkout
  app.post('/payments/checkout', { preHandler: [app.authenticate] }, async (request) => {
    const body = CheckoutBodySchema.parse(request.body);
    const order = await app.db.order.findUnique({ where: { id: body.orderId } });
    if (!order) throw AppError.notFound('Order', body.orderId);
    if (order.buyerId !== request.user!.userId) throw AppError.forbidden();
    if (order.status !== 'PENDING') throw AppError.badRequest(`Order status '${order.status}' is not payable`);

    await assessCheckoutRisk(app, order.buyerId, order.id, order.totalCents);

    const buyer = await app.db.user.findUnique({ where: { id: order.buyerId } });
    const items = await app.db.orderItem.findMany({ where: { orderId: order.id } });
    const products = await Promise.all(items.map((i: { productId: string }) => app.db.product.findUnique({ where: { id: i.productId } })));

    const provider = resolvePaymentProvider(app.config, body.provider);
    const result = await provider.createCheckout({
      orderId: order.id,
      amountCents: order.totalCents,
      currency: order.currency,
      buyerEmail: buyer?.email,
      productNames: products.filter(Boolean).map((p) => p.name),
      successUrl: body.successUrl ?? `${app.config.baseUrl}/checkout/success?orderId=${order.id}`,
      cancelUrl: body.cancelUrl ?? `${app.config.baseUrl}/checkout/cancel?orderId=${order.id}`,
    });

    if (result.immediatePaid) {
      const { order: paid } = await fulfillPaidOrder(app, order.id, { paymentRef: result.sessionId, provider: result.provider as PaymentProviderName });
      return { status: 'PAID', provider: result.provider, sessionId: result.sessionId, order: paid };
    }

    await app.db.order.update({ where: { id: order.id }, data: { paymentProvider: result.provider, paymentRef: result.sessionId } });
    await app.db.payment.create({ data: { orderId: order.id, provider: result.provider, providerRef: result.sessionId, amountCents: order.totalCents, currency: order.currency, status: 'PENDING' } });

    return { status: 'PENDING', provider: result.provider, sessionId: result.sessionId, checkoutUrl: result.checkoutUrl };
  });

  // POST /payments/webhook — Stripe signature verification needs the exact raw request bytes, so
  // this route (and only this route) is registered on a child plugin instance with its own
  // `application/json` content-type parser that hands back a Buffer instead of a parsed object;
  // Fastify content-type parsers are scoped to the encapsulation context they're added on, so
  // every other module's routes keep the default JSON body parsing untouched.
  await app.register(async (scoped) => {
    scoped.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    scoped.post('/payments/webhook', async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      const rawBody = request.body as Buffer;

      if (!app.config.stripe.secretKey || !app.config.stripe.webhookSecret || !signature || Array.isArray(signature)) {
        // No Stripe configured (or no signature header, e.g. a MockProvider-only deployment) —
        // best-effort parse as a mock/test event shape rather than 500ing.
        let payload: { type?: string; data?: { object?: Record<string, unknown> } } = {};
        try {
          payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
          reply.status(400);
          return { error: { code: 'BAD_REQUEST', message: 'Invalid webhook payload' } };
        }
        if (payload.type === 'checkout.session.completed') {
          const obj = payload.data?.object ?? {};
          const metadata = obj.metadata as Record<string, unknown> | undefined;
          const orderId = (obj.client_reference_id as string | undefined) ?? (metadata?.orderId as string | undefined);
          if (typeof orderId === 'string') {
            await fulfillPaidOrder(app, orderId, { paymentRef: (obj.id as string) ?? 'mock_webhook', provider: 'MOCK' });
          }
        }
        return { received: true };
      }

      let event;
      try {
        event = await verifyStripeWebhook(app.config, rawBody, signature);
      } catch (err) {
        reply.status(400);
        return { error: { code: 'BAD_REQUEST', message: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` } };
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as unknown as {
          client_reference_id?: string | null;
          metadata?: Record<string, string> | null;
          mode?: string;
          id: string;
          payment_intent?: string | null;
          subscription?: string | null;
        };
        const orderId = session.client_reference_id ?? session.metadata?.orderId;
        if (session.mode === 'subscription') {
          const userId = session.client_reference_id ?? session.metadata?.userId;
          const tier = session.metadata?.tier;
          if (userId && tier) {
            const { activateSubscriptionFromWebhook } = await import('../subscriptions/index.js');
            await activateSubscriptionFromWebhook(app, userId, tier, session.subscription ?? session.id);
          }
        } else if (orderId) {
          await fulfillPaidOrder(app, orderId, { paymentRef: session.payment_intent ?? session.id, provider: 'STRIPE' });
        }
      }

      return { received: true };
    });
  });

  // Fallback so `resolvePaymentProvider`/`MockProvider` remain reachable for other modules that
  // want the always-present provider without needing to know about config resolution.
  void MockProvider;
}
