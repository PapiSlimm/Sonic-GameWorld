// Royalty accrual: the write-side counterpart to split.ts. Called by orders/fulfillment.ts the
// moment an order is marked PAID, and by orders/refund handling (as a REVERSED entry) when a paid
// item is later refunded. There is no separate `CreatorBalance` table in the schema (§10) — a
// creator's available balance is always `SUM(RoyaltyAccrual where status=ACCRUED) - SUM(pending
// Payout)`, computed on read (see creator/index.ts's `GET /creators/me/balance`, and
// `GET /royalties/me` below) rather than duplicated into a separately-maintained counter that
// could drift out of sync.
import { createEvent } from '@sonic-gameworld/events';
import type { FastifyInstance } from 'fastify';
import type { PlanTier } from '@sonic-gameworld/world-schema';
import { computeRoyaltySplit } from './split.js';

export interface AccrueRoyaltyInput {
  creatorId: string; // CreatorProfile.id
  orderItemId: string;
  grossCents: number;
  creatorTier: PlanTier;
}

/** Create the ACCRUED royalty row for one paid order item and publish ROYALTY_ACCRUED. Returns
 * the split alongside the created row so the caller can also stamp OrderItem.feeCents/royaltyCents. */
export async function accrueRoyalty(app: FastifyInstance, input: AccrueRoyaltyInput) {
  const split = computeRoyaltySplit(input.grossCents, input.creatorTier);
  const accrual = await app.db.royaltyAccrual.create({
    data: {
      creatorId: input.creatorId,
      orderItemId: input.orderItemId,
      amountCents: split.royaltyCents,
      currency: 'USD',
      status: 'ACCRUED',
    },
  });
  await app.bus.publish(
    createEvent({ type: 'ROYALTY_ACCRUED', payload: { royaltyId: accrual.id, creatorId: input.creatorId, orderItemId: input.orderItemId, amountCents: split.royaltyCents } }),
  );
  return { accrual, split };
}

/** Reverse a previously-accrued royalty (full refund of its order item). Marks the original
 * ACCRUED rows for the item as REVERSED rather than deleting them, preserving the audit trail. */
export async function reverseRoyaltyForOrderItem(app: FastifyInstance, orderItemId: string): Promise<number> {
  const rows = await app.db.royaltyAccrual.findMany({ where: { orderItemId, status: 'ACCRUED' } });
  let reversedCents = 0;
  for (const row of rows as Array<{ id: string; amountCents: number }>) {
    await app.db.royaltyAccrual.update({ where: { id: row.id }, data: { status: 'REVERSED' } });
    reversedCents += row.amountCents;
  }
  return reversedCents;
}
