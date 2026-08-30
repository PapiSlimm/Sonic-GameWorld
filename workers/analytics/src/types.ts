// ---------------------------------------------------------------------------------------------
// IMPORTANT — cross-package note (see README "Schema gap" section for the full explanation):
// PlayerMetric / GameMetric / AssetMetric / CreatorMetric / MarketplaceMetric are named in
// CONTRACTS.md §13 and the product spec's "Complete Data Model" (Analytics section), but do NOT
// yet exist in services/api/prisma/schema.prisma. This worker is built against the PrismaLike
// interface below (five `upsert`-only delegates matching the row shapes documented in the
// README) so that once those models are added to the shared schema, this worker needs zero code
// changes to run against the real database — only `prisma:generate` needs to be re-run.
// ---------------------------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export interface PrismaLike {
  analyticsEvent: { findMany: (args: Row) => Promise<Row[]> };
  gameSession: { findMany: (args: Row) => Promise<Row[]> };
  gameSessionPlayer: { findMany: (args: Row) => Promise<Row[]> };
  order: { findMany: (args: Row) => Promise<Row[]> };
  orderItem: { findMany: (args: Row) => Promise<Row[]> };
  product: { findMany: (args: Row) => Promise<Row[]> };
  review: { findMany: (args: Row) => Promise<Row[]> };
  productVersion: { findMany: (args: Row) => Promise<Row[]> };
  assetPassport: { findMany: (args: Row) => Promise<Row[]> };
  moderationItem: { findMany: (args: Row) => Promise<Row[]> };
  asset: { findMany: (args: Row) => Promise<Row[]> };
  creatorProfile: { findMany: (args: Row) => Promise<Row[]>; update: (args: Row) => Promise<Row> };
  user: { count: (args?: Row) => Promise<number> };
  // The five rollup sinks — see the cross-package note above.
  playerMetric: { upsert: (args: Row) => Promise<Row> };
  gameMetric: { upsert: (args: Row) => Promise<Row> };
  assetMetric: { upsert: (args: Row) => Promise<Row> };
  creatorMetric: { upsert: (args: Row) => Promise<Row> };
  marketplaceMetric: { upsert: (args: Row) => Promise<Row> };
}

export interface RollupJobPayload {
  /** ISO timestamps for the hour window [periodStart, periodEnd). Both default to "the last
   * completed hour" (relative to when the job runs) when omitted, so a plain cron trigger with no
   * payload does the right thing. */
  periodStart?: string;
  periodEnd?: string;
}

export interface PeriodWindow {
  start: Date;
  end: Date;
}

export interface PlayerMetricRow {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  sessionsJoined: number;
  gamesPlayed: number;
  playtimeMinutes: number;
  eventsCount: number;
}

export interface GameMetricRow {
  gameId: string;
  periodStart: Date;
  periodEnd: Date;
  sessionsStarted: number;
  sessionsEnded: number;
  uniquePlayers: number;
  playtimeMinutes: number;
  avgSessionMinutes: number;
}

export interface AssetMetricRow {
  assetId: string;
  periodStart: Date;
  periodEnd: Date;
  views: number;
  purchases: number;
  revenueCents: number;
}

export interface CreatorMetricRow {
  creatorId: string;
  periodStart: Date;
  periodEnd: Date;
  salesCount: number;
  grossRevenueCents: number;
  royaltyCents: number;
  reviewsReceived: number;
  avgRating: number;
  repScoreSnapshot: number;
}

export interface MarketplaceMetricRow {
  periodStart: Date;
  periodEnd: Date;
  ordersCount: number;
  grossRevenueCents: number;
  platformFeeCents: number;
  refundsCents: number;
  newProducts: number;
  newUsers: number;
  activeSessions: number;
}

export interface RollupResult {
  window: PeriodWindow;
  playerMetrics: number;
  gameMetrics: number;
  assetMetrics: number;
  creatorMetrics: number;
  marketplaceMetric: MarketplaceMetricRow;
}
