'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, Pencil, Plus } from 'lucide-react';
import { Badge, Button, DataTable, PriceTag, type DataTableColumn } from '@sonic-gameworld/ui';
import { useApi, useResource } from '../../lib/api';
import { deriveStageFromStatus, demoProductRows } from '../../lib/demo';
import type { CreatorProductRow } from '../../lib/types';
import type { ProductStatus } from '@sonic-gameworld/gameworld-sdk';

const STATUS_TONE: Record<ProductStatus, 'default' | 'accent' | 'warn' | 'danger' | 'success'> = {
  DRAFT: 'default',
  PENDING_REVIEW: 'warn',
  PUBLISHED: 'success',
  DELISTED: 'default',
  REJECTED: 'danger',
};

export default function ProductsPage() {
  const { client, identity } = useApi();
  const router = useRouter();

  const res = useResource(
    'creator:products',
    async (c) => {
      const page = await c.marketplace.search({ creatorId: identity?.userId, limit: 50 });
      return page.items.map((p) => ({ ...p, pipelineStage: deriveStageFromStatus(p.status) }));
    },
    demoProductRows,
  );

  const columns: DataTableColumn<CreatorProductRow>[] = [
    {
      key: 'name',
      header: 'Product',
      accessor: (r) => r.name,
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-text">{r.name}</p>
          <p className="text-xs text-muted">{r.category}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => r.status,
      sortable: true,
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'pipelineStage',
      header: 'Pipeline stage',
      accessor: (r) => r.pipelineStage,
      sortable: true,
      render: (r) => <span className="font-hud text-xs text-muted">{r.pipelineStage.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      accessor: (r) => r.priceCents,
      sortable: true,
      align: 'right',
      render: (r) => <PriceTag cents={r.priceCents} size="sm" />,
    },
    { key: 'sales', header: 'Sales', accessor: (r) => r.sales, sortable: true, align: 'right', render: (r) => r.sales.toLocaleString() },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" title="View pipeline" onClick={() => router.push(`/products/${r.id}/pipeline`)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" title="Edit" disabled>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Products</h1>
          <p className="text-sm text-muted">Everything you have listed, in every pipeline stage.</p>
        </div>
        <Link href="/products/new" className="inline-flex h-10 items-center gap-2 rounded-control bg-accent px-4 text-sm font-semibold text-bg shadow-glow hover:bg-accent/90">
          <Plus className="h-4 w-4" /> New product
        </Link>
      </div>

      {res.mode === 'demo' && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <DataTable
        columns={columns}
        rows={res.data}
        rowKey={(r) => r.id}
        loading={res.loading}
        emptyMessage="No products yet — publish your first one."
        initialSort={{ key: 'status', dir: 'asc' }}
      />
    </div>
  );
}
