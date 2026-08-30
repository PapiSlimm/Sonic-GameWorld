'use client';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Plus } from 'lucide-react';
import { Badge, Panel, PriceTag, ScoreRing, StatTile, formatCents, formatCompact } from '@sonic-gameworld/ui';
import { useApi, useResource } from '../lib/api';
import { demoDashboard, demoOrders } from '../lib/demo';
import { RevenueChart } from '../components/RevenueChart';
import { ReputationBars } from '../components/ReputationBars';
import { PlanTierTable } from '../components/PlanTierTable';

export default function OverviewPage() {
  const { client, identity } = useApi();

  const dashboardRes = useResource('creator:dashboard', (c) => c.creators.dashboard(), demoDashboard);
  const dashboard = dashboardRes.data;

  // No dedicated "creator sales feed" endpoint exists yet (see README "Known API gaps") — the
  // recent-orders table always renders demo data; live mode is documented as a known gap.
  const ordersRes = useResource('creator:orders', async () => demoOrders(), demoOrders);
  const orders = ordersRes.data;

  const tier = identity?.tier ?? 'PRO';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Overview</h1>
          <p className="text-sm text-muted">Your Creator Passport at a glance.</p>
        </div>
        <Link
          href="/products/new"
          className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-bg shadow-glow hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" /> Publish a product
        </Link>
      </div>

      {dashboardRes.mode === 'demo' && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Sales" value={formatCompact(dashboard.sales)} delta={dashboard.salesDeltaPct} deltaLabel="30d" tone="accent" />
        <StatTile label="Revenue" value={formatCents(dashboard.revenueCents)} delta={dashboard.revenueDeltaPct} deltaLabel="30d" tone="accent" />
        <StatTile label="Followers" value={formatCompact(dashboard.followers)} tone="violet" />
        <StatTile label="Avg rating" value={dashboard.averageRating.toFixed(1)} tone="warn" />
        <StatTile label="Payouts pending" value={formatCents(dashboard.pendingPayoutCents)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Revenue (30 days)" className="lg:col-span-2">
          <RevenueChart points={dashboard.timeseries.map((p) => ({ date: p.date.slice(5), revenueCents: p.revenueCents }))} />
        </Panel>
        <Panel title="Creator Score">
          <div className="flex items-center gap-5">
            <ScoreRing value={dashboard.reputation.score} label="Score" size={104} />
            <div className="flex-1">
              <ReputationBars reputation={dashboard.reputation} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Recent orders" className="lg:col-span-2" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Product</th>
                  <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Buyer</th>
                  <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Amount</th>
                  <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-3 py-2.5 text-text/90">{o.productName}</td>
                    <td className="px-3 py-2.5 text-muted">@{o.buyerHandle}</td>
                    <td className="px-3 py-2.5"><PriceTag cents={o.amountCents} size="sm" /></td>
                    <td className="px-3 py-2.5">
                      <Badge tone={o.status === 'PAID' ? 'success' : o.status === 'PENDING' ? 'warn' : 'danger'}>{o.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Plan"
          actions={
            <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              Manage <ArrowUpRight className="h-3 w-3" />
            </Link>
          }
        >
          <p className="mb-3 text-sm text-text/80">
            You are on <span className="font-semibold text-text">{tier}</span>. Upgrading lowers your marketplace fee and raises project/asset limits.
          </p>
        </Panel>
      </div>

      <Panel title="Plan tiers & fees">
        <PlanTierTable currentTier={tier} />
      </Panel>
    </div>
  );
}
