'use client';
import { useMemo, useState } from 'react';
import { Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import {
  Badge, Button, DataTable, Dialog, EmptyState, Input, Panel, Tabs, Toggle, useToast, type DataTableColumn,
} from '@sonic-gameworld/ui';
import type { Webhook } from '@sonic-gameworld/gameworld-sdk';
import { DataSourceBadge } from '../../components/data-source-badge';
import { EventTypeSelect } from '../../components/event-type-select';
import { formatRelative } from '../../lib/format';
import { useLiveOrDemo } from '../../lib/use-live';
import {
  DEMO_DELIVERIES, DEMO_WEBHOOKS, EventType, applyOverlay, createWebhook, deleteWebhookLocally, fetchWebhooks,
  isValidWebhookUrl, readOverlays, recordTestSend, setWebhookActiveLocally, type WebhookDelivery, type WebhookOverlay,
} from '../../lib/webhooks';

export default function WebhooksPage() {
  const { data: webhooks, source, error, loading, reload } = useLiveOrDemo(fetchWebhooks, DEMO_WEBHOOKS, []);
  const [overlays, setOverlays] = useState<Record<string, WebhookOverlay>>(() => readOverlays());
  const [createOpen, setCreateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<EventType[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Webhook | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const toast = useToast();

  const rows = webhooks
    .map((w) => applyOverlay(w, overlays[w.id]))
    .filter((w) => !overlays[w.id]?.deleted);

  const resetForm = () => {
    setUrl('');
    setDescription('');
    setEvents([]);
  };

  const submit = async () => {
    if (!isValidWebhookUrl(url) || events.length === 0) return;
    setCreating(true);
    try {
      await createWebhook({ url, events, description: description || undefined });
      toast.push({ title: 'Webhook created', description: url, tone: 'success' });
      reload();
    } catch (err) {
      toast.push({ title: 'Could not reach the API — nothing was created', description: err instanceof Error ? err.message : 'Unknown error', tone: 'danger' });
    } finally {
      setCreating(false);
      setCreateOpen(false);
      resetForm();
    }
  };

  const toggleActive = (w: Webhook) => {
    const next = setWebhookActiveLocally(w.id, !w.active);
    setOverlays(next);
  };

  const doDelete = (w: Webhook) => {
    const next = deleteWebhookLocally(w.id);
    setOverlays(next);
    setDeleteTarget(null);
    if (selected?.id === w.id) setSelected(null);
    toast.push({ title: 'Webhook removed', description: w.url, tone: 'warn' });
  };

  const testSend = (w: Webhook, event: EventType | string) => {
    const delivery = recordTestSend(w.id, event, overlays[w.id]);
    setOverlays(readOverlays());
    toast.push({
      title: delivery.status === 'SUCCESS' ? 'Test delivery succeeded' : 'Test delivery failed',
      description: `${event} → ${w.url} (${delivery.statusCode}, ${delivery.durationMs}ms)`,
      tone: delivery.status === 'SUCCESS' ? 'success' : 'danger',
    });
  };

  const columns: DataTableColumn<Webhook & { deliveries: WebhookDelivery[] }>[] = useMemo(
    () => [
      { key: 'url', header: 'Endpoint', render: (r) => (
        <div>
          <div className="font-hud text-xs text-text">{r.url}</div>
          {r.description && <div className="mt-0.5 text-xs text-muted">{r.description}</div>}
        </div>
      ) },
      { key: 'events', header: 'Events', render: (r) => (
        <div className="flex max-w-xs flex-wrap gap-1">
          {r.events.slice(0, 3).map((e) => <Badge key={e} tone="default">{e}</Badge>)}
          {r.events.length > 3 && <Badge tone="default">+{r.events.length - 3}</Badge>}
        </div>
      ) },
      { key: 'failures', header: 'Failures', align: 'right', sortable: true, accessor: (r) => r.failureCount, render: (r) => <span className={r.failureCount > 0 ? 'text-danger' : 'text-muted'}>{r.failureCount}</span> },
      { key: 'lastDelivery', header: 'Last delivery', sortable: true, accessor: (r) => r.lastDeliveryAt ?? '', render: (r) => <span className="text-xs text-muted">{r.lastDeliveryAt ? formatRelative(r.lastDeliveryAt) : 'never'}</span> },
      { key: 'active', header: 'Active', align: 'center', render: (r) => <Toggle checked={r.active} onChange={() => toggleActive(r)} size="sm" /> },
      { key: 'actions', header: '', align: 'right', render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>Inspect</Button>
          <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteTarget(r)} />
        </div>
      ) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlays],
  );

  const selectedRow = selected ? applyOverlay(selected, overlays[selected.id]) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Webhooks</h1>
          <p className="text-sm text-muted">Subscribe to platform events and inspect deliveries.</p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={source} error={error} />
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>New webhook</Button>
        </div>
      </div>

      <Panel padded={false}>
        {rows.length === 0 && !loading ? (
          <EmptyState icon={<WebhookIcon className="h-6 w-6" />} title="No webhooks yet" description="Create one to receive platform events." className="border-none" />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} loading={loading} initialSort={{ key: 'lastDelivery', dir: 'desc' }} className="border-none" />
        )}
      </Panel>

      <Dialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetForm(); }}
        title="Create webhook"
        description="POST /v1/developer/webhooks"
        size="lg"
        footer={<Button loading={creating} disabled={!isValidWebhookUrl(url) || events.length === 0} onClick={submit}>Create webhook</Button>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Endpoint URL" placeholder="https://your-service.dev/hooks/gameworld" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          <Input label="Description (optional)" placeholder="What does this webhook do?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div>
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Event types ({events.length} selected)</span>
            <EventTypeSelect value={events} onChange={setEvents} className="mt-2" />
          </div>
        </div>
      </Dialog>

      <Dialog open={!!selectedRow} onClose={() => setSelected(null)} title={selectedRow?.url} description={selectedRow ? `${selectedRow.events.length} event type(s) · created ${formatRelative(selectedRow.createdAt)}` : undefined} size="lg">
        {selectedRow && (
          <Tabs defaultValue="events">
            <Tabs.List>
              <Tabs.Trigger value="events">Events</Tabs.Trigger>
              <Tabs.Trigger value="deliveries">Delivery log</Tabs.Trigger>
              <Tabs.Trigger value="test">Test send</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="events">
              <div className="flex flex-wrap gap-1.5">
                {selectedRow.events.map((e) => <Badge key={e} tone="violet">{e}</Badge>)}
              </div>
            </Tabs.Content>
            <Tabs.Content value="deliveries">
              {(() => {
                const deliveries = selectedRow.deliveries.length ? selectedRow.deliveries : (DEMO_DELIVERIES[selectedRow.id] ?? []);
                if (!deliveries.length) return <p className="text-sm text-muted">No deliveries recorded yet — try a test send.</p>;
                return (
                  <ul className="flex flex-col gap-2">
                    {deliveries.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded-control border border-border bg-bg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Badge tone={d.status === 'SUCCESS' ? 'success' : 'danger'}>{d.statusCode}</Badge>
                          <span className="font-hud text-text/90">{d.event}</span>
                        </div>
                        <div className="flex items-center gap-3 text-muted">
                          <span>{d.durationMs}ms</span>
                          <span>{formatRelative(d.attemptedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Tabs.Content>
            <Tabs.Content value="test">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Send a synthetic delivery for one of this webhook's subscribed events.</p>
                <div className="flex flex-wrap gap-2">
                  {selectedRow.events.map((e) => (
                    <Button key={e} size="sm" variant="secondary" leftIcon={<Send className="h-3.5 w-3.5" />} onClick={() => testSend(selectedRow, e)}>
                      {e}
                    </Button>
                  ))}
                </div>
              </div>
            </Tabs.Content>
          </Tabs>
        )}
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this webhook?"
        description={deleteTarget ? deleteTarget.url : undefined}
        footer={<Button variant="danger" onClick={() => deleteTarget && doDelete(deleteTarget)}>Delete</Button>}
      />
    </div>
  );
}
