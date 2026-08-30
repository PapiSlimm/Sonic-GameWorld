/**
 * Types local to the Creator Passport dashboard.
 *
 * Everything that maps directly onto an API resource lives in `@sonic-gameworld/gameworld-sdk`
 * (re-exported through this app via `lib/api.tsx`). The types below cover UI-only concepts, or
 * concepts CONTRACTS.md §9 does not (yet) expose a dedicated endpoint for — each is called out
 * with a comment so the gap is easy to find later. See README.md "Known API gaps".
 */
import type { Cents, ISODate, ProductCategory, ProductSummary } from '@sonic-gameworld/gameworld-sdk';

/**
 * A hold placed on part of a creator's balance (fraud review, chargeback, tax hold, ...).
 * CONTRACTS §9 defines `GET /creators/me/balance` and `.../payouts` but no dedicated "holds"
 * resource — this dashboard renders holds as a read-only annotation on the balance panel,
 * sourced from demo data in offline mode and left empty (no holds) when running live until a
 * `holds` field/endpoint is added to the API.
 */
export interface PayoutHold {
  id: string;
  amountCents: Cents;
  reason: string;
  createdAt: ISODate;
  expectedReleaseAt?: ISODate | null;
}

/**
 * A single row of "recent orders" on the overview page. CONTRACTS §9 has `GET /orders` for a
 * *buyer's* own orders, but no "sales feed" endpoint scoped to a creator's products — see
 * README.md. This dashboard synthesizes recent-orders rows from `analytics.creator()` /
 * `creators.dashboard()` (top products + revenue) in live mode, and from demo fixtures offline.
 */
export interface CreatorOrderRow {
  id: string;
  productId: string;
  productName: string;
  buyerHandle: string;
  amountCents: Cents;
  status: 'PAID' | 'REFUNDED' | 'PENDING';
  createdAt: ISODate;
}

/** A row in the /products DataTable — a `ProductSummary` plus the derived pipeline-stage label. */
export interface CreatorProductRow extends ProductSummary {
  pipelineStage: string;
}

/** Minimal shape used by the "pick a world" step of the publish wizard. */
export interface WorldOption {
  id: string;
  name: string;
  description: string;
  thumbnailUrl?: string | null;
  entityCount: number;
}

export type ProductKind = 'ASSET' | 'WORLD';

/** All 10 `LicenseRecord` boolean flags (CONTRACTS §6), keyed for the license-builder toggle grid. */
export type LicenseFlagKey =
  | 'commercial'
  | 'personal'
  | 'enterprise'
  | 'redistribution'
  | 'modification'
  | 'multiplayer'
  | 'aiTraining'
  | 'resale'
  | 'sublicensing'
  | 'attribution';

export const LICENSE_FLAG_ORDER: LicenseFlagKey[] = [
  'commercial',
  'personal',
  'enterprise',
  'redistribution',
  'modification',
  'multiplayer',
  'aiTraining',
  'resale',
  'sublicensing',
  'attribution',
];

export const LICENSE_FLAG_LABELS: Record<LicenseFlagKey, { label: string; hint: string }> = {
  commercial: { label: 'Commercial use', hint: 'Buyer may use this in a commercial product' },
  personal: { label: 'Personal use', hint: 'Buyer may use this in non-commercial / personal projects' },
  enterprise: { label: 'Enterprise use', hint: 'Buyer may use this inside a large-org / enterprise deployment' },
  redistribution: { label: 'Redistribution', hint: 'Buyer may redistribute the asset itself, standalone' },
  modification: { label: 'Modification', hint: 'Buyer may modify or remix the asset' },
  multiplayer: { label: 'Multiplayer', hint: 'Buyer may ship this inside a multiplayer game' },
  aiTraining: { label: 'AI training', hint: 'Buyer may use this to train or fine-tune AI models' },
  resale: { label: 'Resale', hint: 'Buyer may resell the asset (or derivatives) to third parties' },
  sublicensing: { label: 'Sublicensing', hint: 'Buyer may grant sublicenses to third parties' },
  attribution: { label: 'Attribution required', hint: 'Buyer must credit the creator when used' },
};

/** Form state for the publish wizard's License Builder step (drives `buildLicenseRecord`). */
export interface LicenseFormState {
  flags: Record<LicenseFlagKey, boolean>;
  attributionText: string;
  seats: number | null;
  spdx: string;
}

export interface PublishWizardState {
  kind: ProductKind;
  category: ProductCategory | null;
  // Step 2 — upload or pick a world
  assetFileKey: string | null;
  assetFileName: string | null;
  assetSizeBytes: number | null;
  assetId: string | null;
  worldId: string | null;
  // Step 3 — details
  name: string;
  description: string;
  genre: string[];
  engines: string[];
  specs: string;
  // Step 4 — license + pricing
  license: LicenseFormState;
  priceCents: number;
}
