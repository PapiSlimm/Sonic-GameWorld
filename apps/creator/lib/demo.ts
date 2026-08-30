/**
 * Offline demo fallback data for the Creator Passport dashboard.
 *
 * Every page tries the live API first (via `useResource` in `lib/api.tsx`) and falls back to
 * these fixtures whenever the request fails — no backend reachable, dev login rejected, network
 * error, etc. Values are deterministic (no `Math.random()` at module scope) so server-rendered
 * and client-rendered markup never mismatch, and so the vitest suite can assert on shape.
 */
import type {
  Cents,
  CreatorAnalytics,
  CreatorBalance,
  CreatorDashboard,
  CreatorPassport,
  CreatorReputation,
  Organization,
  OrgMember,
  Payout,
  ProductCategory,
  ProductStatus,
  ProductSummary,
  Subscription,
} from '@sonic-gameworld/gameworld-sdk';
import { PIPELINE_STAGES, type PipelineStage } from '@sonic-gameworld/world-schema';
import type { CreatorOrderRow, CreatorProductRow, PayoutHold, WorldOption } from './types';

export const DEMO_CREATOR_ID = 'usr_demo_nova';
export const DEMO_HANDLE = 'novaforge';
export const DEMO_DISPLAY_NAME = 'Nova Ando';
export const DEMO_ORG_ID = 'org_demo_novaforge';

function daysAgo(n: number): string {
  const d = new Date('2026-08-26T09:00:00.000Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

export function demoReputation(): CreatorReputation {
  return {
    score: 78,
    quality: 84,
    reliability: 91,
    sales: 72,
    updates: 66,
    reviews: 80,
    support: 74,
    originality: 88,
    compliance: 95,
    computedAt: daysAgo(0),
  };
}

export const DEMO_PRODUCTS_SEED: {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  priceCents: Cents;
  status: ProductStatus;
  sales: number;
  rating: number;
  ratingCount: number;
  featured: boolean;
}[] = [
  { id: 'prod_neon_tokyo', slug: 'neon-tokyo-2099', name: 'Neon Tokyo 2099', category: 'WORLD', priceCents: 4900, status: 'PUBLISHED', sales: 812, rating: 4.7, ratingCount: 213, featured: true },
  { id: 'prod_cyber_vehicles', slug: 'cyberpunk-vehicle-pack', name: 'Cyberpunk Vehicle Pack', category: 'VEHICLE', priceCents: 1900, status: 'PUBLISHED', sales: 1204, rating: 4.5, ratingCount: 389, featured: true },
  { id: 'prod_detective_morgan', slug: 'detective-morgan-npc', name: 'Detective Morgan — AI NPC', category: 'AI_AGENT', priceCents: 2900, status: 'PUBLISHED', sales: 356, rating: 4.8, ratingCount: 97, featured: false },
  { id: 'prod_market_kit', slug: 'night-market-game-kit', name: 'Night Market Game Kit', category: 'GAME_KIT', priceCents: 3900, status: 'PENDING_REVIEW', sales: 0, rating: 0, ratingCount: 0, featured: false },
  { id: 'prod_boss_cinematic', slug: 'tower-seven-cinematic', name: 'Tower Seven — Boss Cinematic', category: 'CINEMATIC', priceCents: 1500, status: 'DRAFT', sales: 0, rating: 0, ratingCount: 0, featured: false },
  { id: 'prod_survival_system', slug: 'urban-survival-system', name: 'Urban Survival System', category: 'SYSTEM', priceCents: 2400, status: 'DRAFT', sales: 0, rating: 0, ratingCount: 0, featured: false },
  { id: 'prod_relic_hunt', slug: 'relic-hunt-mission-pack', name: 'Relic Hunt Mission Pack', category: 'MISSION', priceCents: 990, status: 'REJECTED', sales: 0, rating: 0, ratingCount: 0, featured: false },
];

const CREATOR_REF: ProductSummary['creator'] = {
  id: DEMO_CREATOR_ID,
  handle: DEMO_HANDLE,
  displayName: DEMO_DISPLAY_NAME,
  avatarUrl: null,
  verified: true,
};

export function demoProductSummaries(): ProductSummary[] {
  return DEMO_PRODUCTS_SEED.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    genre: i % 2 === 0 ? ['CYBERPUNK', 'OPEN_WORLD'] : ['SCIFI'],
    engines: ['WEB', 'UNITY'],
    priceCents: p.priceCents,
    currency: 'USD',
    thumbnailUrl: null,
    rating: p.rating,
    ratingCount: p.ratingCount,
    sales: p.sales,
    creator: CREATOR_REF,
    licenseSummary: { commercial: true, multiplayer: i % 2 === 0, attribution: i % 3 === 0 },
    status: p.status,
    featured: p.featured,
    publishedAt: p.status === 'PUBLISHED' ? daysAgo(120 - i * 10) : null,
  }));
}

/** CONTRACTS §13 pipeline stages a product's status has (at minimum) already cleared. */
const STATUS_TO_STAGE_INDEX: Record<ProductStatus, number> = {
  DRAFT: 0,
  PENDING_REVIEW: PIPELINE_STAGES.indexOf('CREATOR_APPROVAL'),
  PUBLISHED: PIPELINE_STAGES.length - 1,
  DELISTED: PIPELINE_STAGES.length - 1,
  REJECTED: PIPELINE_STAGES.indexOf('AI_TAGGING'),
};

/** Derives a display-only current pipeline stage from a product's marketplace status. */
export function deriveStageFromStatus(status: ProductStatus): PipelineStage {
  const idx = STATUS_TO_STAGE_INDEX[status];
  return PIPELINE_STAGES[Math.max(0, idx)] ?? PIPELINE_STAGES[0]!;
}

export function demoProductRows(): CreatorProductRow[] {
  return demoProductSummaries().map((p) => ({ ...p, pipelineStage: deriveStageFromStatus(p.status) }));
}

/** Deterministic per-stage status for the /products/[id]/pipeline demo view. */
export function demoPipelineFor(productId: string): { stage: PipelineStage; status: 'DONE' | 'RUNNING' | 'PENDING' | 'FAILED'; message?: string }[] {
  const seed = DEMO_PRODUCTS_SEED.find((p) => p.id === productId);
  const doneThrough = seed ? PIPELINE_STAGES.indexOf(deriveStageFromStatus(seed.status)) : 3;
  const failed = seed?.status === 'REJECTED';
  return PIPELINE_STAGES.map((stage, i) => {
    if (failed && i === doneThrough) return { stage, status: 'FAILED' as const, message: 'Flagged by AI safety review — resubmit with revised assets.' };
    if (i < doneThrough) return { stage, status: 'DONE' as const };
    if (i === doneThrough && !failed) return { stage, status: seed?.status === 'PUBLISHED' || seed?.status === 'DELISTED' ? ('DONE' as const) : ('RUNNING' as const) };
    return { stage, status: 'PENDING' as const };
  });
}

export function demoTimeseries(days = 30): { date: string; revenueCents: Cents; sales: number; views: number }[] {
  const out: { date: string; revenueCents: Cents; sales: number; views: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const t = (days - 1 - i) / (days - 1);
    const wave = Math.sin(t * Math.PI * 2.4) * 0.25;
    const trend = 0.4 + t * 0.6;
    const level = Math.max(0.05, trend + wave);
    out.push({
      date: daysAgo(i).slice(0, 10),
      revenueCents: Math.round(18000 * level),
      sales: Math.round(9 * level),
      views: Math.round(420 * level) + 40,
    });
  }
  return out;
}

export function demoDashboard(): CreatorDashboard {
  const timeseries = demoTimeseries();
  const revenueCents = timeseries.reduce((sum, p) => sum + p.revenueCents, 0);
  const sales = timeseries.reduce((sum, p) => sum + p.sales, 0);
  const products = demoProductSummaries();
  const topProducts = [...products]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5)
    .map((p) => ({ ...p, revenueCents: p.sales * p.priceCents }));
  return {
    revenueCents,
    revenueDeltaPct: 12.4,
    sales,
    salesDeltaPct: 8.1,
    followers: 4820,
    averageRating: 4.6,
    reputation: demoReputation(),
    timeseries,
    topProducts,
    pendingPayoutCents: 214300,
  };
}

export function demoBalance(): CreatorBalance {
  return { availableCents: 512400, pendingCents: 214300, lifetimeCents: 8_412_900, currency: 'USD', nextPayoutAt: daysAgo(-6) };
}

export function demoPayoutHolds(): PayoutHold[] {
  return [
    { id: 'hold_1', amountCents: 42000, reason: 'Routine fraud review on a large single order — releases automatically after 7 days.', createdAt: daysAgo(2), expectedReleaseAt: daysAgo(-5) },
    { id: 'hold_2', amountCents: 15000, reason: 'Chargeback dispute open on order #8831 (Cyberpunk Vehicle Pack).', createdAt: daysAgo(9), expectedReleaseAt: null },
  ];
}

export function demoPayouts(): Payout[] {
  const statuses: Payout['status'][] = ['SENT', 'SENT', 'SENT', 'PROCESSING', 'SENT', 'FAILED', 'SENT'];
  return statuses.map((status, i) => ({
    id: `payout_${i}`,
    creatorId: DEMO_CREATOR_ID,
    amountCents: 180000 + i * 15000,
    currency: 'USD',
    status,
    provider: 'STRIPE_CONNECT',
    providerRef: status === 'FAILED' ? null : `po_demo_${1000 + i}`,
    requestedAt: daysAgo(7 * (i + 1)),
    sentAt: status === 'SENT' ? daysAgo(7 * (i + 1) - 2) : null,
  }));
}

export function demoOrders(): CreatorOrderRow[] {
  const products = DEMO_PRODUCTS_SEED.filter((p) => p.sales > 0);
  const buyers = ['pixelrunner', 'auroraforge', 'ghost_dev', 'kaelan', 'mira_vx', 'tokyo_drift', 'lumen'];
  return Array.from({ length: 8 }).map((_, i) => {
    const p = products[i % products.length]!;
    return {
      id: `order_${9000 + i}`,
      productId: p.id,
      productName: p.name,
      buyerHandle: buyers[i % buyers.length]!,
      amountCents: p.priceCents,
      status: i === 5 ? 'REFUNDED' : i === 2 ? 'PENDING' : 'PAID',
      createdAt: daysAgo(i),
    };
  });
}

export function demoAnalytics(): CreatorAnalytics {
  const timeseries = demoTimeseries(30);
  const series = {
    revenue: timeseries.map((p) => ({ t: p.date, value: p.revenueCents / 100 })),
    uploads: timeseries.map((p, i) => ({ t: p.date, value: i % 4 === 0 ? 1 : 0 })),
    conversion: timeseries.map((p) => ({ t: p.date, value: Math.round((p.sales / Math.max(1, p.views)) * 1000) / 10 })),
  };
  return {
    period: { from: timeseries[0]!.date, to: timeseries[timeseries.length - 1]!.date },
    totals: {
      activation: 68,
      uploads: 14,
      conversion: 4.2,
      retention: 61,
      revenueCents: timeseries.reduce((s, p) => s + p.revenueCents, 0),
    },
    series,
    breakdowns: {
      category: [
        { key: 'WORLD', value: 812 },
        { key: 'VEHICLE', value: 1204 },
        { key: 'AI_AGENT', value: 356 },
      ],
    },
    products: DEMO_PRODUCTS_SEED.map((p) => ({
      productId: p.id,
      name: p.name,
      views: 400 + p.sales * 2,
      sales: p.sales,
      revenueCents: p.sales * p.priceCents,
      conversion: p.sales > 0 ? Math.round((p.sales / (400 + p.sales * 2)) * 1000) / 10 : 0,
    })),
  };
}

export function demoWorlds(): WorldOption[] {
  return [
    { id: 'world_neon_tokyo', name: 'Neon Tokyo 2099', description: 'A rain-soaked cyberpunk district with syndicate towers and a night market.', thumbnailUrl: null, entityCount: 44 },
    { id: 'world_frostreach', name: 'Frostreach Outpost', description: 'A snowbound survival outpost world, mid-construction.', thumbnailUrl: null, entityCount: 12 },
    { id: 'world_shibuya_fringe', name: 'Shibuya Fringe', description: 'A locked expansion district, unlocked by the Neon Tokyo main quest.', thumbnailUrl: null, entityCount: 6 },
  ];
}

export function demoPassport(): CreatorPassport {
  const products = demoProductSummaries();
  return {
    profile: {
      id: DEMO_CREATOR_ID,
      userId: DEMO_CREATOR_ID,
      handle: DEMO_HANDLE,
      displayName: DEMO_DISPLAY_NAME,
      bio: 'Building cyberpunk worlds and the NPCs who live in them. Ex-VFX, now full-time in Sonic GameWorld.',
      avatarUrl: null,
      bannerUrl: null,
      website: 'https://novaforge.example',
      socials: { x: 'https://x.com/novaforge', discord: 'novaforge#0001' },
      verified: true,
      followers: 4820,
      productCount: products.length,
      createdAt: daysAgo(410),
    },
    reputation: demoReputation(),
    badges: ['TOP_RATED', 'FAST_SUPPORT', 'ORIGINAL_CONTENT'],
    stats: { totalSales: products.reduce((s, p) => s + p.sales, 0), totalRevenueCents: 8_412_900, averageRating: 4.6, ratingCount: products.reduce((s, p) => s + p.ratingCount, 0) },
    featuredProducts: products.filter((p) => p.featured),
  };
}

export function demoOrganization(): Organization {
  return { id: DEMO_ORG_ID, name: 'NovaForge Studio', slug: 'novaforge-studio', tier: 'PRO', ownerId: DEMO_CREATOR_ID, logoUrl: null, createdAt: daysAgo(400), updatedAt: daysAgo(2) };
}

export function demoOrgMembers(): OrgMember[] {
  return [
    { userId: DEMO_CREATOR_ID, orgId: DEMO_ORG_ID, role: 'owner', joinedAt: daysAgo(400), user: { id: DEMO_CREATOR_ID, handle: DEMO_HANDLE, displayName: DEMO_DISPLAY_NAME, avatarUrl: null } },
    { userId: 'usr_demo_kai', orgId: DEMO_ORG_ID, role: 'editor', joinedAt: daysAgo(210), user: { id: 'usr_demo_kai', handle: 'kai_builds', displayName: 'Kai Nakamura', avatarUrl: null } },
    { userId: 'usr_demo_ren', orgId: DEMO_ORG_ID, role: 'viewer', joinedAt: daysAgo(60), user: { id: 'usr_demo_ren', handle: 'ren_qa', displayName: 'Ren Okafor', avatarUrl: null } },
  ];
}

export function demoSubscription(): Subscription {
  return {
    id: 'sub_demo_1',
    userId: DEMO_CREATOR_ID,
    orgId: DEMO_ORG_ID,
    tier: 'PRO',
    status: 'ACTIVE',
    priceCents: 4900,
    currency: 'USD',
    interval: 'MONTH',
    currentPeriodStart: daysAgo(14),
    currentPeriodEnd: daysAgo(-16),
    cancelAtPeriodEnd: false,
    provider: 'STRIPE',
    providerRef: 'sub_stripe_demo',
  };
}
