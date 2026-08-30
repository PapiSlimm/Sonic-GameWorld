'use client';
import { useMemo, useState } from 'react';
import { Ban, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Badge, Button, DataTable, Dialog, EmptyState, Panel, Select, Tabs, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { DataSourceBadge } from '../../components/data-source-badge.js';
import { formatRelative } from '../../lib/format.js';
import { useLiveOrDemo } from '../../lib/use-live.js';
import {
  DEMO_MODERATION_QUEUE, MODERATION_CATEGORIES, MODERATION_CATEGORY_LABEL, MODERATION_CATEGORY_TONE,
  fetchModerationQueue, resolveModerationCase, type AdminModerationItem,
} from '../../lib/moderation.js';

const SEVERITY_TONE = { LOW: 'default', MEDIUM: 'warn', HIGH: 'danger', CRITICAL: 'danger' } as const;
const STATUS_TONE = { PENDING: 'default', IN_REVIEW: 'info', APPROVED: 'success', REJECTED: 'danger', ESCALATED: 'violet' } as const;

export default function ModerationPage() {
  const { data: items, source, error, loading, reload } = useLiveOrDemo(fetchModerationQueue, DEMO_MODERATION_QUEUE, []);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected] = useState<AdminModerationItem | null>(null);
  const [local, setLocal] = useState<Record<string, AdminModerationItem>>({});
  const toast = useToast();

  const merged = items.map((i) => local[i.id] ?? i);
  const filtered = merged.filter((i) => (!categoryFilter || i.category === categoryFilter) && (!statusFilter || i.status === statusFilter));

  const columns: DataTableColumn<AdminModerationItem>[] = useMemo(
    () => [
      {
        key: 'category', header: 'Type', sortable: true, accessor: (r) => r.category,
        render: (r) => <Badge tone={MODERATION_CATEGORY_TONE[r.category]}>{MODERATION_CATEGORY_LABEL[r.category]}</Badge>,
      },
      { key: 'target', header: 'Target', render: (r) => <span className="text-text">{r.targetName}</span> },
      { key: 'reason', header: 'Reason', render: (r) => <span className="line-clamp-2 max-w-md text-xs text-muted">{r.reason}</span> },
      {
        key: 'severity', header: 'Severity', sortable: true, accessor: (r) => r.severity,
        render: (r) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>,
      },
      {
        key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status,
        render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge>,
      },
      { key: 'created', header: 'Reported', sortable: true, accessor: (r) => r.createdAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.createdAt)}</span> },
    ],
    [],
  );

  const resolve = async (item: AdminModerationItem, resolution: 'APPROVED' | 'REJECTED' | 'ESCALATED', action: 'NONE' | 'DELIST' | 'BAN' | 'WARN') => {
    const optimistic: AdminModerationItem = { ...item, status: resolution, resolvedAt: new Date().toISOString() };
    setLocal((s) => ({ ...s, [item.id]: optimistic }));
    setSelected(optimistic);
    try {
      if (source === 'live') await resolveModerationCase(item.id, resolution, action);
      toast.push({ title: `Case ${resolution.toLowerCase()}`, description: item.targetName, tone: resolution === 'REJECTED' ? 'danger' : resolution === 'ESCALATED' ? 'warn' : 'success' });
    } catch (err) {
      toast.push({ title: 'Resolution staged locally', description: err instanceof Error ? err.message : 'API call failed', tone: 'warn' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Moderation Queue</h1>
          <p className="text-sm text-muted">Stolen assets, malware, prohibited content, suspicious files, trademark, copyright similarity and metadata tampering.</p>
        </div>
        <DataSourceBadge source={source} error={error} />
      </div>

      <Panel padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <Select
            className="w-56"
            options={MODERATION_CATEGORIES.map((c) => ({ value: c, label: MODERATION_CATEGORY_LABEL[c] }))}
            placeholder="All types"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />
          <Select
            className="w-44"
            options={['PENDING', 'IN_REVIEW', 'ESCALATED', 'APPROVED', 'REJECTED'].map((s) => ({ value: s, label: s.replace('_', ' ') }))}
            placeholder="All statuses"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Button size="sm" variant="ghost" onClick={reload}>Refresh</Button>
          <span className="ml-auto font-hud text-xs text-muted">{filtered.length} case{filtered.length === 1 ? '' : 's'}</span>
        </div>
        {filtered.length === 0 && !loading ? (
          <EmptyState title="No matching cases" description="Try clearing filters." className="border-none" />
        ) : (
          <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={setSelected} loading={loading} initialSort={{ key: 'created', dir: 'desc' }} className="border-none" />
        )}
      </Panel>

      <Dialog open={!!selected} onClose={() => setSelected(null)} title={selected?.targetName} description={selected ? `${selected.refKind} · ${selected.refId}` : undefined} size="lg"
        footer={
          selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="danger" leftIcon={<Ban className="h-4 w-4" />} disabled={selected.status === 'REJECTED'} onClick={() => resolve(selected, 'REJECTED', 'DELIST')}>
                Reject &amp; delist
              </Button>
              <Button variant="secondary" leftIcon={<TriangleAlert className="h-4 w-4" />} disabled={selected.status === 'ESCALATED'} onClick={() => resolve(selected, 'ESCALATED', 'NONE')}>
                Escalate
              </Button>
              <Button variant="primary" leftIcon={<CheckCircle2 className="h-4 w-4" />} disabled={selected.status === 'APPROVED'} onClick={() => resolve(selected, 'APPROVED', 'NONE')}>
                Approve
              </Button>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={MODERATION_CATEGORY_TONE[selected.category]}>{MODERATION_CATEGORY_LABEL[selected.category]}</Badge>
              <Badge tone={SEVERITY_TONE[selected.severity]}>{selected.severity}</Badge>
              <Badge tone={STATUS_TONE[selected.status]}>{selected.status.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-text/90">{selected.reason}</p>
            <Tabs defaultValue="evidence">
              <Tabs.List>
                <Tabs.Trigger value="evidence">Evidence</Tabs.Trigger>
                <Tabs.Trigger value="meta">Metadata</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="evidence">
                <ul className="flex flex-col gap-2">
                  {selected.evidence.map((e, i) => (
                    <li key={i} className="rounded-control border border-border bg-bg p-3 text-sm">
                      <div className="font-hud text-[10px] uppercase tracking-wider text-muted">{e.label}</div>
                      <div className="mt-0.5 text-text/90">{e.detail}</div>
                    </li>
                  ))}
                </ul>
              </Tabs.Content>
              <Tabs.Content value="meta">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                  <dt className="text-muted">Case ID</dt><dd className="text-text/90">{selected.id}</dd>
                  <dt className="text-muted">Pipeline stage</dt><dd className="text-text/90">{selected.stage}</dd>
                  <dt className="text-muted">Reporter</dt><dd className="text-text/90">{selected.reporterId ?? 'Automated (AI safety pipeline)'}</dd>
                  <dt className="text-muted">Assignee</dt><dd className="text-text/90">{selected.assigneeId ?? 'Unassigned'}</dd>
                  <dt className="text-muted">Reported</dt><dd className="text-text/90">{formatRelative(selected.createdAt)}</dd>
                </dl>
              </Tabs.Content>
            </Tabs>
          </div>
        )}
      </Dialog>
    </div>
  );
}
