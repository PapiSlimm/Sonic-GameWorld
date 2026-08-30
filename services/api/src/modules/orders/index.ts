// orders module (§9): create (from cart or an explicit item list) -> pay (via payments module,
// which calls back into `fulfillment.ts`) -> refund -> library (purchased products).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import { AppError } from '../../errors.js';
import { PaginationQuerySchema, toPage, toPrismaPageArgs } from '../../plugins/pagination.js';
import { refundOrder } from './fulfillment.js';

const CreateOrderItemSchema = z.object({ productId: z.string(), quantity: z.number().int().positive().max(20).default(1) });
const CreateOrderSchema = z.object({ items: z.array(CreateOrderItemSchema).min(1).optional() });

const RefundBodySchema = z.object({ itemIds: z.array(z.string()).optional(), reason: z.string().max(1000).optional() });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOrder(order: any, items: any[] = []) {
  return {
    id: order.id,
    buyerId: order.buyerId,
    status: order.status,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    currency: order.currency,
    paymentProvider: order.paymentProvider,
    paymentRef: order.paymentRef ?? null,
    couponCode: order.couponCode ?? null,
    items: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      versionId: i.versionId ?? null,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      feeCents: i.feeCents,
      royaltyCents: i.royaltyCents,
    })),
    createdAt: new Date(order.createdAt).toISOString(),
    paidAt: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    refundedAt: order.refundedAt ? new Date(order.refundedAt).toISOString() : null,
  };
}

async function loadOrderWithItems(app: FastifyInstance, orderId: string) {
  const order = await app.db.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const items = await app.db.orderItem.findMany({ where: { orderId } });
  return { order, items };
}

/** Snapshot the buyer's cart into `{ productId, quantity, unitPriceCents }` triples, validating
 * every product is still purchasable. Shared by the cart-sourced branch of `POST /orders`. */
async function resolveExplicitItems(app: FastifyInstance, items: { productId: string; quantity: number }[]) {
  const resolved: { productId: string; quantity: number; unitPriceCents: number }[] = [];
  for (const item of items) {
    const product = await app.db.product.findUnique({ where: { id: item.productId } });
    if (!product || product.deletedAt) throw AppError.notFound('Product', item.productId);
    if (product.status !== 'PUBLISHED') throw AppError.badRequest(`Product '${product.name}' is not currently available for purchase`);
    resolved.push({ productId: product.id, quantity: item.quantity, unitPriceCents: product.priceCents });
  }
  return resolved;
}

export async function registerOrdersModule(app: FastifyInstance): Promise<void> {
  // POST /orders — from an explicit item list, or (when omitted) the caller's current cart.
  app.post('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateOrderSchema.parse(request.body ?? {});
    const buyerId = request.user!.userId;

    let lineItems: { productId: string; quantity: number; unitPriceCents: number }[];
    let discountCents = 0;
    let taxCents = 0;
    let couponCode: string | null = null;
    let sourceCart: { id: string } | null = null;

    if (body.items) {
      lineItems = await resolveExplicitItems(app, body.items);
    } else {
      const cart = await app.db.cart.findUnique({ where: { userId: buyerId } });
      if (!cart) throw AppError.badRequest('Cart is empty');
      const cartItems = await app.db.cartItem.findMany({ where: { cartId: cart.id } });
      if (cartItems.length === 0) throw AppError.badRequest('Cart is empty');
      lineItems = cartItems.map((i: { productId: string; quantity: number; unitPriceCents: number }) => ({ productId: i.productId, quantity: i.quantity, unitPriceCents: i.unitPriceCents }));
      discountCents = cart.discountCents;
      taxCents = cart.taxCents;
      couponCode = cart.couponCode ?? null;
      sourceCart = cart;
    }

    const subtotalCents = lineItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
    const totalCents = Math.max(0, subtotalCents - discountCents + taxCents);

    const order = await app.db.order.create({
      data: { buyerId, status: 'PENDING', subtotalCents, discountCents, taxCents, totalCents, currency: 'USD', paymentProvider: 'MOCK', couponCode },
    });
    const items = [];
    for (const li of lineItems) {
      items.push(await app.db.orderItem.create({ data: { orderId: order.id, productId: li.productId, quantity: li.quantity, unitPriceCents: li.unitPriceCents } }));
    }

    if (sourceCart) {
      await app.db.cartItem.deleteMany({ where: { cartId: sourceCart.id } });
    }

    await app.bus.publish(createEvent({ type: 'ORDER_CREATED', payload: { orderId: order.id, buyerId, totalCents, items: items.length } }));

    reply.status(201);
    return serializeOrder(order, items);
  });

  // GET /orders — the caller's own order history.
  app.get('/orders', { preHandler: [app.authenticate] }, async (request) => {
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const rows = await app.db.order.findMany({ where: { buyerId: request.user!.userId }, orderBy: { createdAt: 'desc' }, ...toPrismaPageArgs(query) });
    const withItems = await Promise.all(rows.map(async (o: { id: string }) => ({ order: o, items: await app.db.orderItem.findMany({ where: { orderId: o.id } }) })));
    return toPage(
      withItems.map(({ order, items }) => serializeOrder(order, items)),
      query,
    );
  });

  // GET /orders/:id
  app.get('/orders/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const loaded = await loadOrderWithItems(app, id);
    if (!loaded) throw AppError.notFound('Order', id);
    const isAdmin = request.user!.roles.includes('platform_admin');
    if (loaded.order.buyerId !== request.user!.userId && !isAdmin) throw AppError.forbidden();
    return serializeOrder(loaded.order, loaded.items);
  });

  // POST /orders/:id/refund — buyer or platform_admin; full refund by default, or just `itemIds`.
  app.post('/orders/:id/refund', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const order = await app.db.order.findUnique({ where: { id } });
    if (!order) throw AppError.notFound('Order', id);
    const isAdmin = request.user!.roles.includes('platform_admin');
    if (order.buyerId !== request.user!.userId && !isAdmin) throw AppError.forbidden();
    if (order.status !== 'PAID' && order.status !== 'PARTIALLY_REFUNDED') {
      throw AppError.badRequest(`Order status '${order.status}' cannot be refunded`);
    }

    const body = RefundBodySchema.parse(request.body ?? {});
    if (body.itemIds) {
      const allItems = await app.db.orderItem.findMany({ where: { orderId: id } });
      const validIds = new Set(allItems.map((i: { id: string }) => i.id));
      for (const itemId of body.itemIds) {
        if (!validIds.has(itemId)) throw AppError.badRequest(`Order item '${itemId}' does not belong to this order`);
      }
    }

    // Provider-side refund happens here so the module boundary (payments owns Stripe/Mock) is
    // respected without a circular import: payments/provider.ts has no dependency on orders.
    const { resolvePaymentProvider } = await import('../payments/provider.js');
    const provider = resolvePaymentProvider(app.config, order.paymentProvider === 'STRIPE' ? 'STRIPE' : 'MOCK');
    const targetItems = body.itemIds
      ? (await app.db.orderItem.findMany({ where: { orderId: id, id: { in: body.itemIds } } }))
      : await app.db.orderItem.findMany({ where: { orderId: id } });
    const refundAmountCents = targetItems.reduce((sum: number, i: { unitPriceCents: number; quantity: number }) => sum + i.unitPriceCents * i.quantity, 0);

    if (order.paymentRef) {
      const providerResult = await provider.refund({ paymentRef: order.paymentRef, amountCents: refundAmountCents, reason: body.reason });
      if (!providerResult.refunded) throw AppError.badRequest(`Refund failed: ${providerResult.failureReason ?? 'unknown provider error'}`);
    }

    const outcome = await refundOrder(app, id, { itemIds: body.itemIds, reason: body.reason });
    const items = await app.db.orderItem.findMany({ where: { orderId: id } });
    return { ...serializeOrder(outcome.order, items), refundedCents: outcome.refundedCents, refundedItemIds: outcome.refundedItemIds };
  });

  // GET /library — the caller's purchased products (distinct, from PAID/PARTIALLY_REFUNDED orders).
  app.get('/library', { preHandler: [app.authenticate] }, async (request) => {
    const query = PaginationQuerySchema.parse(request.query ?? {});
    const orders = await app.db.order.findMany({ where: { buyerId: request.user!.userId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } } });
    const orderIds = orders.map((o: { id: string }) => o.id);
    const items = orderIds.length > 0 ? await app.db.orderItem.findMany({ where: { orderId: { in: orderIds } } }) : [];

    const byProduct = new Map<string, { productId: string; acquiredAt: Date; orderId: string }>();
    for (const item of items as Array<{ productId: string; orderId: string }>) {
      const order = orders.find((o: { id: string }) => o.id === item.orderId);
      const acquiredAt = order?.paidAt ? new Date(order.paidAt) : new Date();
      const existing = byProduct.get(item.productId);
      if (!existing || acquiredAt > existing.acquiredAt) byProduct.set(item.productId, { productId: item.productId, acquiredAt, orderId: item.orderId });
    }

    const entries = [...byProduct.values()].sort((a, b) => b.acquiredAt.getTime() - a.acquiredAt.getTime());
    const products = await Promise.all(entries.map((e) => app.db.product.findUnique({ where: { id: e.productId } })));
    const merged = entries.map((e, i) => ({ entry: e, product: products[i] })).filter((m) => Boolean(m.product));

    const page = toPage(
      merged.map((m) => ({ id: m.entry.productId })),
      query,
    );
    const pageProductIds = new Set(page.items.map((i) => i.id));
    const items2 = merged
      .filter((m) => pageProductIds.has(m.entry.productId))
      .map((m) => ({
        product: {
          id: m.product.id,
          slug: m.product.slug,
          name: m.product.name,
          category: m.product.category,
          thumbnailUrl: m.product.thumbnailUrl ?? null,
          license: m.product.license,
        },
        orderId: m.entry.orderId,
        acquiredAt: m.entry.acquiredAt.toISOString(),
      }));

    return { items: items2, nextCursor: page.nextCursor };
  });
}
