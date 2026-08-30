'use client';
import { useState } from 'react';
import { Badge, Button, DataTable, Panel, Toggle, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { cn, formatCents } from '@sonic-gameworld/ui';
import { DataSourceBadge } from '../../components/data-source-badge.js';
import { formatRelative } from '../../lib/format.js';
import { readOverrideStore, upsertOverride } from '../../lib/overrides.js';
import { DEMO_PAYOUTS, type AdminPayout } from '../../lib/payouts.js';

const STATUS_TONE = { REQUESTED: 'warn', PROCESSING: 'info', SENT: 'success', FAILED: 'danger', CANCELLED: 'default' } as const;
const OVERRIDE_KEY = 'gw_admin_payout_overrides_v1';
interface PayoutOverride { status: AdminPayout['status']; onHold: boolean }

export default function PayoutsPage() {
  const [overrides, setOverrides] = useState<Record<string, PayoutOverride>>(() => readOverrideStore(OVERRIDE_KEY));
  const toast = useToast();

  const rows = DEMO_PAYOUTS.map((p) => (overrides[p.id] ? { ...p, ...overrides[p.id] } : p));
  const totalPending = rows.filter((p) => p.status === 'REQUESTED' && !p.onHold).reduce((sum, p) => sum + p.amountCents, 0);
  const totalHeld = rows.filter((p) => p.onHold).reduce((sum, p) => sum + p.amountCents, 0);

  const approve = (p: AdminPayout) => {
    const next = upsertOverride<PayoutOverride>(OVERRIDE_KEY, p.id, { status: 'PROCESSING', onHold: false });
    setOverrides(next);
    toast.push({ title: 'Payout approved', description: `${formatCents(p.amountCents)} to ${p.creatorHandle} — staged locally (no admin payout API yet; see README).`, tone: 'success' });
  };

  const toggleHold = (p: AdminPayout) => {
    const next = upsertOverride<PayoutOverride>(OVERRIDE_KEY, p.id, { status: p.status, onHold: !p.onHold });
    setOverrides(next);
    toast.push({ title: p.onHold ? 'Hold released' : 'Payout held', description: p.creatorHandle, tone: p.onHold ? 'success' : 'warn' });
  };

  const columns: DataTableColumn<AdminPayout>[] = [
    { key: 'creator', header: 'Creator', render: (r) => <span className="text-text">@{r.creatorHandle}</span> },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, accessor: (r) => r.amountCents, render: (r) => <span className="font-hud tabular-nums text-text">{formatCents(r.amountCents, r.currency)}</span> },
    { key: 'method', header: 'Method', render: (r) => r.method.replace('_', ' ') },
    { key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: 'requested', header: 'Requested', sortable: true, accessor: (r) => r.requestedAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.requestedAt)}</span> },
    { key: 'hold', header: 'On hold', align: 'center', render: (r) => <Toggle checked={r.onHold} onChange={() => toggleHold(r)} size="sm" /> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <Button size="sm" variant="secondary" disabled={r.status !== 'REQUESTED' || r.onHold} onClick={() => approve(r)}>Approve</Button>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Payouts</h1>
          <p className="text-sm text-muted">Approve creator payout requests or place them on hold pending review.</p>
        </div>
        <DataSourceBadge source="demo" error="No admin-wide payout endpoint exists yet — creators.listPayouts() is self-scoped. See README." />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Panel padded>
          <div className="font-hud text-[11px] uppercase tracking-wider text-muted">Awaiting approval</div>
          <div className={cn('mt-1 font-hud text-2xl font-semibold text-warn')}>{formatCents(totalPending)}</div>
        </Panel>
        <Panel padded>
          <div className="font-hud text-[11px] uppercase tracking-wider text-muted">Currently on hold</div>
          <div className="mt-1 font-hud text-2xl font-semibold text-danger">{formatCents(totalHeld)}</div>
        </Panel>
      </div>

      <Panel padded={false}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} initialSort={{ key: 'requested', dir: 'desc' }} className="border-none" />
      </Panel>
    </div>
  );
}
