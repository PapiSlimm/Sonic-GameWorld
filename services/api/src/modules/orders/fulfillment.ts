// The "on paid" / "on refunded" pipeline (§9 assignment): OrderItem -> royalty accrual -> creator
// balance -> library entitlement -> ORDER_PAID / PLAYER_PURCHASED_ASSET, and its inverse on
// refund. Shared by payments/index.ts (both the MockProvider's synchronous checkout path and the
// Stripe webhook's `checkout.session.completed` handler) and orders/index.ts's refund route, so
// "what happens when an order is paid" lives in exactly one place regardless of which module
// triggered it.
import { createEvent } from '@sonic-gameworld/events';
import type { FastifyInstance } from 'fastify';
import type { PlanTier } from '@sonic-gameworld/world-schema';
import { accrueRoyalty, reverseRoyaltyForOrderItem } from '../royalties/accrual.js';
import { detectPurchaseAnomaly, detectRefundAbuse, placePayoutHold, raiseFraudSignal } from '../moderation/fraud.js';
import { createNotification } from '../notifications/index.js';

export interface FulfillResult {
  order: Record<string, unknown>;
  alreadyPaid: boolean;
}

/** Mark an order PAID and run every downstream side effect. Idempotent: calling it twice for the
 * same order (e.g. a retried Stripe webhook) only runs the side effects once. */
export async function fulfillPaidOrder(app: FastifyInstance, orderId: string, opts: { paymentRef?: string; provider: 'STRIPE' | 'MOCK' }): Promise<FulfillResult> {
  const order = await app.db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`fulfillPaidOrder: order ${orderId} not found`);
  if (order.status === 'PAID' || order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUNDED') {
    return { order, alreadyPaid: true };
  }

  const items = (await app.db.orderItem.findMany({ where: { orderId } })) as Array<{ id: string; productId: string; quantity: number; unitPriceCents: number }>;
  const buyer = await app.db.user.findUnique({ where: { id: order.buyerId } });

  for (const item of items) {
    const product = await app.db.product.findUnique({ where: { id: item.productId } });
    if (!product) continue; // defensive: product deleted between order creation and payment
    const creatorProfile = await app.db.creatorProfile.findUnique({ where: { id: product.creatorId } });
    const creatorUser = creatorProfile ? await app.db.user.findUnique({ where: { id: creatorProfile.userId } }) : null;
    const creatorTier: PlanTier = (creatorUser?.tier as PlanTier | undefined) ?? 'STARTER';

    const grossCents = item.unitPriceCents * item.quantity;
    const { split } = await accrueRoyalty(app, { creatorId: product.creatorId, orderItemId: item.id, grossCents, creatorTier });
    await app.db.orderItem.update({ where: { id: item.id }, data: { feeCents: split.feeCents, royaltyCents: split.royaltyCents } });

    // Library entitlement: grant (or extend) a ProductLicense for the buyer using the product's
    // license record as-is — the concrete grant a buyer can point to for "what am I allowed to do
    // with this".
    await app.db.productLicense.create({
      data: { productId: product.id, buyerId: order.buyerId, record: product.license, seats: (product.license as { seats?: number })?.seats ?? null, grantedAt: new Date() },
    });
    await app.db.product.update({ where: { id: product.id }, data: { sales: { increment: item.quantity } } });

    await app.bus.publish(
      createEvent({
        type: 'PLAYER_PURCHASED_ASSET',
        payload: {
          orderId: order.id,
          orderItemId: item.id,
          buyerId: order.buyerId,
          productId: product.id,
          creatorId: product.creatorId,
          priceCents: item.unitPriceCents,
          feeCents: split.feeCents,
          royaltyCents: split.royaltyCents,
        },
      }),
    );

    // Anti-fraud: self-purchase / wash-trading check per item, since it's the creator behind
    // *this specific* product that's implicated, not the order as a whole.
    if (creatorUser) {
      const recentBuyerCreatorOrders = await app.db.order.count({
        where: { buyerId: order.buyerId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, id: { not: order.id } },
      });
      const anomaly = detectPurchaseAnomaly({
        buyerId: order.buyerId,
        creatorUserId: creatorUser.id,
        orderAmountCents: grossCents,
        buyerCreatorOrderCountLast30d: recentBuyerCreatorOrders,
      });
      if (anomaly.risky) {
        await raiseFraudSignal(app, { userId: order.buyerId, orderId: order.id, result: anomaly, refKind: 'USER', refId: order.buyerId });
        if (anomaly.signals.includes('SELF_PURCHASE')) {
          await placePayoutHold(app, creatorUser.id, `Self-purchase detected on order ${order.id} (product ${product.id})`);
        }
      }
    }
  }

  const paidAt = new Date();
  const updated = await app.db.order.update({
    where: { id: orderId },
    data: { status: 'PAID', paidAt, paymentProvider: opts.provider, paymentRef: opts.paymentRef ?? null },
  });
  await app.db.payment.create({
    data: { orderId, provider: opts.provider, providerRef: opts.paymentRef ?? null, amountCents: order.totalCents, currency: order.currency, status: 'SUCCEEDED' },
  });
  await app.bus.publish(createEvent({ type: 'ORDER_PAID', payload: { orderId: order.id, buyerId: order.buyerId, totalCents: order.totalCents, paymentRef: opts.paymentRef ?? '' } }));

  if (buyer) {
    await createNotification(app.db, {
      userId: buyer.id,
      type: 'ORDER_PAID',
      title: 'Your order is complete',
      body: `Order ${order.id} is paid — ${items.length} item(s) are now in your library.`,
      link: `/orders/${order.id}`,
    }).catch(() => undefined);
  }

  return { order: updated, alreadyPaid: false };
}

export interface RefundOutcome {
  order: Record<string, unknown>;
  refundedCents: number;
  refundedItemIds: string[];
}

/** Refund an order in full, or just the given `itemIds` (partial refund). Reverses the royalty
 * accrual for every refunded item and runs the refund-abuse fraud check on the buyer. */
export async function refundOrder(app: FastifyInstance, orderId: string, opts: { itemIds?: string[]; reason?: string; refundRef?: string }): Promise<RefundOutcome> {
  const order = await app.db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error(`refundOrder: order ${orderId} not found`);

  const allItems = (await app.db.orderItem.findMany({ where: { orderId } })) as Array<{ id: string; unitPriceCents: number; quantity: number }>;
  const targetIds = opts.itemIds && opts.itemIds.length > 0 ? new Set(opts.itemIds) : new Set(allItems.map((i) => i.id));
  const targetItems = allItems.filter((i) => targetIds.has(i.id));

  let refundedCents = 0;
  for (const item of targetItems) {
    refundedCents += item.unitPriceCents * item.quantity;
    await reverseRoyaltyForOrderItem(app, item.id);
  }

  const isFullRefund = targetItems.length === allItems.length;
  const updated = await app.db.order.update({
    where: { id: orderId },
    data: { status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundedAt: new Date() },
  });

  await app.bus.publish(createEvent({ type: 'ORDER_REFUNDED', payload: { orderId, amountCents: refundedCents, reason: opts.reason } }));

  await createNotification(app.db, {
    userId: order.buyerId,
    type: 'ORDER_REFUNDED',
    title: isFullRefund ? 'Your order was refunded' : 'Part of your order was refunded',
    body: `Order ${orderId}: ${(refundedCents / 100).toFixed(2)} ${order.currency} refunded.`,
    link: `/orders/${orderId}`,
  }).catch(() => undefined);

  // Refund-abuse check on the buyer's overall history.
  const buyerOrders = (await app.db.order.findMany({ where: { buyerId: order.buyerId } })) as Array<{ status: string; refundedAt: Date | string | null }>;
  const totalOrders = buyerOrders.filter((o) => o.status !== 'PENDING' && o.status !== 'CANCELLED' && o.status !== 'FAILED').length;
  const refundedOrders = buyerOrders.filter((o) => o.status === 'REFUNDED' || o.status === 'PARTIALLY_REFUNDED').length;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const refundsInLast24h = buyerOrders.filter((o) => o.refundedAt && new Date(o.refundedAt).getTime() >= dayAgo).length;

  const abuse = detectRefundAbuse({ totalOrders, refundedOrders, refundsInLast24h });
  if (abuse.risky) {
    await raiseFraudSignal(app, { userId: order.buyerId, orderId, result: abuse, refKind: 'USER', refId: order.buyerId });
  }

  return { order: updated, refundedCents, refundedItemIds: [...targetIds] };
}
