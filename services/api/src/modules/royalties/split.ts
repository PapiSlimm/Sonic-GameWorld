// Royalty split (§4/§14): creator share = 100 - PLAN[tier].feePct, computed on the CREATOR'S plan
// tier (not the buyer's) — a STUDIO-tier creator keeps 90% of every sale regardless of what plan
// the buyer is on. `splitRevenueCents` (from @sonic-gameworld/world-schema) already implements the
// exact integer-cents rounding rule (§4: "Prices are stored as integer cents"); this file just
// re-exports it under the domain-specific name orders/payments call, plus a small wrapper that
// also returns the OrderItem-shaped `{ feeCents, royaltyCents }` pair.
import { splitRevenueCents, type PlanTier } from '@sonic-gameworld/world-schema';

export interface RoyaltySplit {
  grossCents: number;
  feeCents: number;
  royaltyCents: number;
  feePct: number;
  creatorTier: PlanTier;
}

/** Split one line item's gross revenue (unitPriceCents * quantity) into platform fee + creator
 * royalty, using the selling creator's plan tier. */
export function computeRoyaltySplit(grossCents: number, creatorTier: PlanTier): RoyaltySplit {
  const { feeCents, creatorCents, feePct } = splitRevenueCents(grossCents, creatorTier);
  return { grossCents, feeCents, royaltyCents: creatorCents, feePct, creatorTier };
}
