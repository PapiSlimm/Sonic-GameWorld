'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, DataTable, Dialog, EmptyState, Input, Panel, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { cn } from '@sonic-gameworld/ui';
import type { ApiKey } from '@sonic-gameworld/gameworld-sdk';
import { formatRelative } from '../../lib/format';
import { AVAILABLE_SCOPES, STARTER_DEMO_KEYS, createApiKey, isLiveSession, loadStoredKeys, revokeApiKey, type ApiKeyScope } from '../../lib/keys';

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Set<ApiKeyScope>>(new Set());
  const [creating, setCreating] = useState(false);
  const [freshSecret, setFreshSecret] = useState<{ key: ApiKey; secret: string; source: 'live' | 'demo' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const toast = useToast();

  useEffect(() => {
    const stored = loadStoredKeys();
    setKeys(stored.length ? stored : STARTER_DEMO_KEYS);
    setHydrated(true);
  }, []);

  const live = isLiveSession();

  const reset = () => {
    setName('');
    setScopes(new Set());
  };

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const result = await createApiKey({ name: name.trim(), scopes: Array.from(scopes) });
      setKeys(loadStoredKeys());
      setFreshSecret(result);
      setCreateOpen(false);
      reset();
    } catch (err) {
      toast.push({ title: 'Could not create key', description: err instanceof Error ? err.message : 'Unknown error', tone: 'danger' });
    } finally {
      setCreating(false);
    }
  };

  const doRevoke = async (key: ApiKey) => {
    setRevokeTarget(null);
    await revokeApiKey(key.id);
    setKeys(loadStoredKeys());
    toast.push({ title: 'Key revoked', description: key.name, tone: 'warn' });
  };

  const copySecret = async () => {
    if (!freshSecret) return;
    try {
      await navigator.clipboard.writeText(freshSecret.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const columns: DataTableColumn<ApiKey>[] = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (r) => <span className="text-text">{r.name}</span> },
      { key: 'prefix', header: 'Key', render: (r) => <span className="font-hud text-xs text-muted">{r.prefix}</span> },
      { key: 'scopes', header: 'Scopes', render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.scopes.length ? r.scopes.map((s) => <Badge key={s} tone="default">{s}</Badge>) : <span className="text-xs text-muted">full access</span>}
        </div>
      ) },
      { key: 'lastUsed', header: 'Last used', sortable: true, accessor: (r) => r.lastUsedAt ?? '', render: (r) => <span className="text-xs text-muted">{r.lastUsedAt ? formatRelative(r.lastUsedAt) : 'never'}</span> },
      { key: 'created', header: 'Created', sortable: true, accessor: (r) => r.createdAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.createdAt)}</span> },
      { key: 'expires', header: 'Expires', render: (r) => r.expiresAt ? <span className="text-xs text-muted">{formatRelative(r.expiresAt)}</span> : <Badge tone="default">never</Badge> },
      { key: 'actions', header: '', align: 'right', render: (r) => (
        <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRevokeTarget(r)}>Revoke</Button>
      ) },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">API Keys</h1>
          <p className="text-sm text-muted">Create <code className="font-hud text-accent">gw_live_</code> keys for server-side and SDK access. Secrets are shown once.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={live ? 'success' : 'warn'}>{live ? 'Signed in — creates real keys' : 'Not signed in — demo keys only'}</Badge>
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>New key</Button>
        </div>
      </div>

      <Panel padded={false}>
        {hydrated && keys.length === 0 ? (
          <EmptyState icon={<KeyRound className="h-6 w-6" />} title="No API keys yet" description="Create one to authenticate SDK and server-side requests." className="border-none" />
        ) : (
          <DataTable columns={columns} rows={keys} rowKey={(r) => r.id} initialSort={{ key: 'created', dir: 'desc' }} className="border-none" />
        )}
      </Panel>

      <Dialog
        open={createOpen}
        onClose={() => { setCreateOpen(false); reset(); }}
        title="Create API key"
        description="Choose a name and, optionally, scopes to limit what the key can do."
        footer={<Button loading={creating} disabled={!name.trim()} onClick={submit}>Create key</Button>}
      >
        <div className="flex flex-col gap-4">
          <Input label="Name" placeholder="e.g. Production — Web Client" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div>
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Scopes (none = full access)</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((scope) => {
                const active = scopes.has(scope);
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() =>
                      setScopes((prev) => {
                        const next = new Set(prev);
                        if (next.has(scope)) next.delete(scope);
                        else next.add(scope);
                        return next;
                      })
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 font-hud text-[10px] tracking-wide transition-colors',
                      active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text',
                    )}
                  >
                    {scope}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!freshSecret}
        onClose={() => setFreshSecret(null)}
        title="Key created"
        description="Copy this secret now — it will not be shown again."
        size="lg"
        footer={<Button onClick={() => setFreshSecret(null)}>Done</Button>}
      >
        {freshSecret && (
          <div className="flex flex-col gap-3">
            {freshSecret.source === 'demo' && (
              <Badge tone="warn">Demo key — sign in to create one the real API will accept.</Badge>
            )}
            <div className="flex items-center gap-2 rounded-control border border-border bg-bg p-3">
              <code className="flex-1 overflow-x-auto whitespace-nowrap font-hud text-sm text-accent">{freshSecret.secret}</code>
              <Button size="sm" variant="secondary" leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copySecret}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Send it as <code className="font-hud">x-api-key: {freshSecret.secret.slice(0, 12)}…</code> on every request.
            </p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke this key?"
        description={revokeTarget ? `${revokeTarget.name} (${revokeTarget.prefix}) will stop working immediately.` : undefined}
        footer={<Button variant="danger" onClick={() => revokeTarget && doRevoke(revokeTarget)}>Revoke</Button>}
      />
    </div>
  );
}
