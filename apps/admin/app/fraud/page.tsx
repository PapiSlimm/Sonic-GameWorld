'use client';
import { useMemo, useState } from 'react';
import { Badge, DataTable, Panel, Select, Toggle, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { DataSourceBadge } from '../../components/data-source-badge.js';
import { formatRelative } from '../../lib/format.js';
import { readOverrideStore, upsertOverride } from '../../lib/overrides.js';
import { DEMO_FRAUD_SIGNALS, FRAUD_SIGNAL_TYPES, FRAUD_TYPE_LABEL, type FraudSignal } from '../../lib/fraud.js';

const SEVERITY_TONE = { LOW: 'default', MEDIUM: 'warn', HIGH: 'danger', CRITICAL: 'danger' } as const;
const STATUS_TONE = { OPEN: 'danger', REVIEWING: 'warn', CLEARED: 'success', CONFIRMED: 'violet' } as const;
const OVERRIDE_KEY = 'gw_admin_fraud_overrides_v1';

export default function FraudPage() {
  const [overrides, setOverrides] = useState<Record<string, Partial<FraudSignal>>>(() => readOverrideStore(OVERRIDE_KEY));
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const toast = useToast();

  const rows = DEMO_FRAUD_SIGNALS.map((s) => ({ ...s, ...overrides[s.id] }));
  const filtered = rows.filter((r) => (!typeFilter || r.type === typeFilter) && (!statusFilter || r.status === statusFilter));

  const togglePayoutHold = (signal: FraudSignal) => {
    const next = upsertOverride<FraudSignal>(OVERRIDE_KEY, signal.id, { payoutHeld: !signal.payoutHeld });
    setOverrides(next);
    toast.push({
      title: signal.payoutHeld ? 'Payout released' : 'Payout held',
      description: `${signal.userHandle} — staged locally (no admin fraud API yet; see README).`,
      tone: signal.payoutHeld ? 'success' : 'warn',
    });
  };

  const columns: DataTableColumn<FraudSignal>[] = useMemo(
    () => [
      { key: 'type', header: 'Signal', sortable: true, accessor: (r) => r.type, render: (r) => <Badge tone="default">{FRAUD_TYPE_LABEL[r.type]}</Badge> },
      { key: 'user', header: 'User', render: (r) => <span className="text-text">{r.userHandle}</span> },
      { key: 'detail', header: 'Detail', render: (r) => <span className="line-clamp-2 max-w-md text-xs text-muted">{r.detail}</span> },
      { key: 'score', header: 'Risk score', sortable: true, align: 'right', accessor: (r) => r.score, render: (r) => <span className="font-hud tabular-nums text-text">{r.score}</span> },
      { key: 'severity', header: 'Severity', sortable: true, accessor: (r) => r.severity, render: (r) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge> },
      { key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
      { key: 'created', header: 'Detected', sortable: true, accessor: (r) => r.createdAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.createdAt)}</span> },
      {
        key: 'hold', header: 'Payout hold', align: 'center',
        render: (r) => <Toggle checked={r.payoutHeld} onChange={() => togglePayoutHold(r)} size="sm" />,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Fraud Signals</h1>
          <p className="text-sm text-muted">Payment risk, purchase anomalies, refund abuse, review manipulation, fake engagement and account takeover.</p>
        </div>
        <DataSourceBadge source="demo" error="No /fraud route exists yet in CONTRACTS §9 — see README cross-package gaps." />
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <Select className="w-56" options={FRAUD_SIGNAL_TYPES.map((t) => ({ value: t, label: FRAUD_TYPE_LABEL[t] }))} placeholder="All signal types" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
          <Select className="w-44" options={['OPEN', 'REVIEWING', 'CLEARED', 'CONFIRMED'].map((s) => ({ value: s, label: s }))} placeholder="All statuses" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
          <span className="ml-auto font-hud text-xs text-muted">{filtered.length} signal{filtered.length === 1 ? '' : 's'}</span>
        </div>
        <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} initialSort={{ key: 'score', dir: 'desc' }} className="border-none" />
      </Panel>
    </div>
  );
}
