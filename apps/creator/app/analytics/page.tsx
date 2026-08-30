'use client';
import { AlertTriangle } from 'lucide-react';
import { DataTable, Panel, StatTile, formatCents, type DataTableColumn } from '@sonic-gameworld/ui';
import { useApi, useResource } from '../../lib/api';
import { demoAnalytics } from '../../lib/demo';
import { RevenueChart } from '../../components/RevenueChart';
import type { CreatorAnalytics } from '@sonic-gameworld/gameworld-sdk';

type ProductAnalyticsRow = CreatorAnalytics['products'][number];

export default function AnalyticsPage() {
  const { client } = useApi();
  const res = useResource('creator:analytics', (c) => c.analytics.creator(), demoAnalytics);
  const a = res.data;

  const revenueSeries = a.series['revenue'] ?? [];

  const columns: DataTableColumn<ProductAnalyticsRow>[] = [
    { key: 'name', header: 'Product', accessor: (r) => r.name, sortable: true },
    { key: 'views', header: 'Views', accessor: (r) => r.views, sortable: true, align: 'right' },
    { key: 'sales', header: 'Sales', accessor: (r) => r.sales, sortable: true, align: 'right' },
    { key: 'conversion', header: 'Conversion', accessor: (r) => r.conversion, sortable: true, align: 'right', render: (r) => `${r.conversion.toFixed(1)}%` },
    { key: 'revenue', header: 'Revenue', accessor: (r) => r.revenueCents, sortable: true, align: 'right', render: (r) => formatCents(r.revenueCents) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Analytics</h1>
        <p className="text-sm text-muted">Activation, uploads, conversion, retention and revenue across your catalog.</p>
      </div>

      {res.mode === 'demo' && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Activation" value={`${a.totals['activation'] ?? 0}%`} tone="accent" />
        <StatTile label="Uploads (30d)" value={a.totals['uploads'] ?? 0} />
        <StatTile label="Conversion" value={`${a.totals['conversion'] ?? 0}%`} tone="violet" />
        <StatTile label="Retention" value={`${a.totals['retention'] ?? 0}%`} tone="warn" />
        <StatTile label="Revenue" value={formatCents(a.totals['revenueCents'] ?? 0)} tone="accent" />
      </div>

      <Panel title="Revenue trend">
        <RevenueChart points={revenueSeries.map((p) => ({ date: p.t.slice(5), revenueCents: Math.round(p.value * 100) }))} />
      </Panel>

      <Panel title="Per-product performance" padded={false}>
        <DataTable columns={columns} rows={a.products} rowKey={(r) => r.productId} loading={res.loading} initialSort={{ key: 'revenue', dir: 'desc' }} />
      </Panel>
    </div>
  );
}
