'use client';
import { useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Badge, Button, DataTable, Panel, StatTile, formatCents, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import type { Payout } from '@sonic-gameworld/gameworld-sdk';
import { useApi, useResource } from '../../lib/api';
import { demoBalance, demoPayoutHolds, demoPayouts } from '../../lib/demo';
import type { PayoutHold } from '../../lib/types';

const STATUS_TONE: Record<Payout['status'], 'default' | 'accent' | 'warn' | 'danger' | 'success'> = {
  REQUESTED: 'accent',
  PROCESSING: 'warn',
  SENT: 'success',
  FAILED: 'danger',
  CANCELLED: 'default',
};

export default function PayoutsPage() {
  const { client } = useApi();
  const { push } = useToast();
  const [requesting, setRequesting] = useState(false);

  const balanceRes = useResource('creator:balance', (c) => c.creators.balance(), demoBalance);
  const payoutsRes = useResource('creator:payouts', async (c) => (await c.creators.listPayouts({ limit: 25 })).items, demoPayouts);
  // No dedicated "holds" endpoint yet (see README "Known API gaps") — demo-only in this dashboard.
  const holds: PayoutHold[] = demoPayoutHolds();
  const balance = balanceRes.data;

  const requestPayout = async () => {
    setRequesting(true);
    try {
      if (balanceRes.mode === 'live') {
        await client.creators.requestPayout();
        push({ title: 'Payout requested', tone: 'success' });
        payoutsRes.reload();
        balanceRes.reload();
      } else {
        await new Promise((r) => setTimeout(r, 500));
        push({ title: 'Payout requested (demo)', description: 'No live API connected — this was not actually sent.', tone: 'info' });
      }
    } catch (err) {
      push({ title: 'Payout request failed', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setRequesting(false);
    }
  };

  const columns: DataTableColumn<Payout>[] = [
    { key: 'requestedAt', header: 'Requested', accessor: (r) => r.requestedAt, sortable: true, render: (r) => new Date(r.requestedAt).toLocaleDateString() },
    { key: 'amount', header: 'Amount', accessor: (r) => r.amountCents, sortable: true, align: 'right', render: (r) => formatCents(r.amountCents, r.currency) },
    { key: 'provider', header: 'Method', accessor: (r) => r.provider },
    { key: 'status', header: 'Status', accessor: (r) => r.status, sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Payouts</h1>
          <p className="text-sm text-muted">Your balance, payout history, and any holds.</p>
        </div>
        <Button onClick={() => void requestPayout()} loading={requesting} disabled={balance.availableCents <= 0}>
          Request payout
        </Button>
      </div>

      {(balanceRes.mode === 'demo' || payoutsRes.mode === 'demo') && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Available" value={formatCents(balance.availableCents, balance.currency)} tone="accent" />
        <StatTile label="Pending" value={formatCents(balance.pendingCents, balance.currency)} tone="warn" />
        <StatTile label="Lifetime" value={formatCents(balance.lifetimeCents, balance.currency)} tone="violet" />
      </div>

      {holds.length > 0 && (
        <Panel title="Holds" glow>
          <ul className="flex flex-col gap-3">
            {holds.map((h) => (
              <li key={h.id} className="flex items-start gap-3 rounded-control border border-warn/30 bg-warn/5 p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div className="flex-1">
                  <p className="text-sm text-text">
                    {formatCents(h.amountCents)} held — {h.reason}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Held since {new Date(h.createdAt).toLocaleDateString()}
                    {h.expectedReleaseAt ? ` · expected release ${new Date(h.expectedReleaseAt).toLocaleDateString()}` : ' · release date unknown'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Payout history" padded={false}>
        <DataTable columns={columns} rows={payoutsRes.data} rowKey={(r) => r.id} loading={payoutsRes.loading} initialSort={{ key: 'requestedAt', dir: 'desc' }} />
      </Panel>
    </div>
  );
}
