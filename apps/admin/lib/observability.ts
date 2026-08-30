import type { AnalyticsOverview, Health, Readiness } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

/** Real: `GET /v1/health` and `GET /v1/ready`. */
export async function fetchHealth(): Promise<{ health: Health; ready: Readiness }> {
  const [health, ready] = await Promise.all([getClient().health.check(), getClient().health.ready()]);
  return { health, ready };
}

/** Real: `GET /v1/analytics` — used to source the business-telemetry tiles below. */
export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  return getClient().analytics.overview();
}

export interface OpsTile {
  key: string;
  label: string;
  value: number;
  unit?: string;
  tone: 'accent' | 'warn' | 'danger' | 'default';
  trend: number[];
}

/**
 * `logs / metrics / traces / errors / alerts / audit` have no JSON REST surface in CONTRACTS §9
 * (only a Prometheus-style `GET /v1/metrics`), so these operational tiles are demo counters. The
 * business-telemetry tiles below are real: they read `AnalyticsOverview.totals` by key.
 */
export const DEMO_OPS_TILES: OpsTile[] = [
  { key: 'logs', label: 'Log events / min', value: 18420, tone: 'default', trend: [12, 14, 13, 16, 18, 17, 19, 18] },
  { key: 'metrics', label: 'Active metric series', value: 342, tone: 'default', trend: [300, 310, 305, 320, 330, 335, 340, 342] },
  { key: 'traces', label: 'Traces / min (p95 210ms)', value: 5210, tone: 'accent', trend: [4200, 4400, 4600, 4900, 5000, 5100, 5150, 5210] },
  { key: 'errors', label: 'Errors / hour', value: 37, tone: 'danger', trend: [50, 44, 40, 41, 38, 39, 36, 37] },
  { key: 'alerts', label: 'Open alerts', value: 4, tone: 'warn', trend: [6, 6, 5, 5, 4, 5, 4, 4] },
  { key: 'audit', label: 'Audit log entries / day', value: 1284, tone: 'default', trend: [900, 950, 1000, 1100, 1150, 1200, 1250, 1284] },
];

export interface BusinessMetric {
  key: string;
  label: string;
  format: 'count' | 'percent' | 'currency';
  demoValue: number;
  demoDelta: number;
}

export const BUSINESS_METRICS: BusinessMetric[] = [
  { key: 'creatorActivation', label: 'Creator Activation', format: 'count', demoValue: 214, demoDelta: 6.4 },
  { key: 'assetUploads', label: 'Asset Uploads', format: 'count', demoValue: 8931, demoDelta: 3.1 },
  { key: 'worldCreation', label: 'Worlds Created', format: 'count', demoValue: 512, demoDelta: 9.8 },
  { key: 'aiUsage', label: 'AI Tool Calls', format: 'count', demoValue: 44210, demoDelta: 21.3 },
  { key: 'marketplaceConversion', label: 'Marketplace Conversion', format: 'percent', demoValue: 4.7, demoDelta: 0.6 },
  { key: 'purchaseConversion', label: 'Purchase Conversion', format: 'percent', demoValue: 2.9, demoDelta: -0.3 },
  { key: 'retentionD7', label: 'D7 Retention', format: 'percent', demoValue: 38.2, demoDelta: 1.2 },
  { key: 'revenueCents', label: 'Revenue', format: 'currency', demoValue: 184_230_00, demoDelta: 14.5 },
  { key: 'payoutsCents', label: 'Creator Payouts', format: 'currency', demoValue: 156_490_00, demoDelta: 11.2 },
];

/** Picks a metric out of a live `AnalyticsOverview.totals` bag, falling back per-key rather than all-or-nothing. */
export function pickMetricValue(totals: Record<string, number> | undefined, metric: BusinessMetric): { value: number; live: boolean } {
  const v = totals?.[metric.key];
  return typeof v === 'number' && Number.isFinite(v) ? { value: v, live: true } : { value: metric.demoValue, live: false };
}
