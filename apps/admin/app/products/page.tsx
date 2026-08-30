'use client';
import { useState } from 'react';
import { Badge, DataTable, Panel, PriceTag, Toggle, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { DataSourceBadge } from '../../components/data-source-badge.js';
import { readOverrideStore, upsertOverride } from '../../lib/overrides.js';
import { useLiveOrDemo } from '../../lib/use-live.js';
import { DEMO_PRODUCTS, fetchAdminProducts, updateProduct } from '../../lib/products.js';
import type { ProductStatus, ProductSummary } from '@sonic-gameworld/gameworld-sdk';

const STATUS_TONE: Record<ProductStatus, 'default' | 'warn' | 'success' | 'danger' | 'violet'> = {
  DRAFT: 'default', PENDING_REVIEW: 'warn', PUBLISHED: 'success', DELISTED: 'danger', REJECTED: 'danger',
};
const OVERRIDE_KEY = 'gw_admin_product_overrides_v1';
interface ProductOverride { status: ProductStatus; featured: boolean }

export default function ProductsPage() {
  const { data: products, source, error, loading, reload } = useLiveOrDemo(fetchAdminProducts, DEMO_PRODUCTS, []);
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>(() => readOverrideStore(OVERRIDE_KEY));
  const toast = useToast();

  const rows = products.map((p) => (overrides[p.id] ? { ...p, status: overrides[p.id]!.status, featured: overrides[p.id]!.featured } : p));

  const stage = (id: string, patch: ProductOverride) => setOverrides(upsertOverride<ProductOverride>(OVERRIDE_KEY, id, patch));

  const toggleDelist = async (p: ProductSummary) => {
    const nextStatus: ProductStatus = p.status === 'DELISTED' ? 'PUBLISHED' : 'DELISTED';
    stage(p.id, { status: nextStatus, featured: p.featured });
    try {
      if (source === 'live') await updateProduct(p.id, { status: nextStatus });
      toast.push({ title: nextStatus === 'DELISTED' ? 'Product delisted' : 'Product relisted', description: p.name, tone: nextStatus === 'DELISTED' ? 'warn' : 'success' });
    } catch (err) {
      toast.push({ title: 'Applied locally', description: err instanceof Error ? err.message : 'API call failed', tone: 'warn' });
    }
  };

  const toggleFeature = async (p: ProductSummary) => {
    const nextFeatured = !p.featured;
    stage(p.id, { status: p.status, featured: nextFeatured });
    try {
      if (source === 'live') await updateProduct(p.id, { featured: nextFeatured });
      toast.push({ title: nextFeatured ? 'Featured' : 'Unfeatured', description: p.name, tone: 'success' });
    } catch (err) {
      toast.push({ title: 'Applied locally', description: err instanceof Error ? err.message : 'API call failed', tone: 'warn' });
    }
  };

  const columns: DataTableColumn<ProductSummary>[] = [
    { key: 'name', header: 'Product', render: (r) => (
      <div>
        <div className="text-text">{r.name}</div>
        <div className="text-xs text-muted">by {r.creator.displayName}</div>
      </div>
    ) },
    { key: 'category', header: 'Category', sortable: true, accessor: (r) => r.category, render: (r) => <Badge tone="default">{r.category}</Badge> },
    { key: 'price', header: 'Price', align: 'right', sortable: true, accessor: (r) => r.priceCents, render: (r) => <PriceTag cents={r.priceCents} size="sm" /> },
    { key: 'sales', header: 'Sales', align: 'right', sortable: true, accessor: (r) => r.sales },
    { key: 'rating', header: 'Rating', align: 'right', sortable: true, accessor: (r) => r.rating, render: (r) => `${r.rating.toFixed(1)} ★ (${r.ratingCount})` },
    { key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge> },
    { key: 'featured', header: 'Featured', align: 'center', render: (r) => <Toggle checked={r.featured} onChange={() => toggleFeature(r)} size="sm" /> },
    { key: 'delist', header: 'Delisted', align: 'center', render: (r) => <Toggle checked={r.status === 'DELISTED'} onChange={() => toggleDelist(r)} size="sm" /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Products</h1>
          <p className="text-sm text-muted">Delist listings that violate policy, or feature standout products on the marketplace.</p>
        </div>
        <DataSourceBadge source={source} error={error} />
      </div>
      <Panel padded={false}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} initialSort={{ key: 'sales', dir: 'desc' }} className="border-none" />
        <div className="border-t border-border p-2 text-right">
          <button type="button" onClick={reload} className="font-hud text-[11px] uppercase tracking-wider text-muted hover:text-accent">Refresh</button>
        </div>
      </Panel>
    </div>
  );
}
