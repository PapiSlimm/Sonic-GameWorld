'use client';
import { useState } from 'react';
import { AlertTriangle, ExternalLink, Key, KeyRound } from 'lucide-react';
import { Badge, Button, DataTable, Input, Panel, Select, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import type { OrgMember, PlanTier, Role } from '@sonic-gameworld/gameworld-sdk';
import { useApi, useResource } from '../../lib/api';
import { demoOrgMembers, demoOrganization, demoSubscription } from '../../lib/demo';
import { PlanTierTable } from '../../components/PlanTierTable';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

const DEVELOPER_PORTAL_URL = process.env.NEXT_PUBLIC_DEVELOPER_PORTAL_URL ?? 'http://localhost:3005';

export default function SettingsPage() {
  const { client, status, identity } = useApi();
  const { push } = useToast();

  const orgRes = useResource('settings:org', async (c) => (identity?.orgId ? c.orgs.get(identity.orgId) : demoOrganization()), demoOrganization);
  const membersRes = useResource('settings:members', async () => demoOrgMembers(), demoOrgMembers);
  const subRes = useResource('settings:subscription', (c) => c.subscriptions.me(), demoSubscription);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [inviting, setInviting] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [changingTier, setChangingTier] = useState<PlanTier | null>(null);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      if (status === 'live' && identity?.orgId) {
        await client.orgs.addMember(identity.orgId, { email: inviteEmail.trim(), role: inviteRole });
        membersRes.reload();
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
      push({ title: `Invited ${inviteEmail.trim()}`, tone: 'success' });
      setInviteEmail('');
    } catch (err) {
      push({ title: 'Invite failed', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, role: Role) => {
    try {
      if (status === 'live' && identity?.orgId) {
        await client.orgs.updateMember(identity.orgId, userId, { role });
        membersRes.reload();
      }
      push({ title: 'Role updated', tone: 'success' });
    } catch (err) {
      push({ title: 'Could not update role', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    }
  };

  const createKey = async () => {
    if (!keyName.trim()) return;
    setCreatingKey(true);
    try {
      if (status === 'live') {
        const created = await client.auth.createApiKey({ name: keyName.trim() });
        setCreatedKey(created.key);
      } else {
        await new Promise((r) => setTimeout(r, 300));
        setCreatedKey(`gw_live_demo_${Math.random().toString(36).slice(2, 10)}`);
      }
      push({ title: 'API key created', description: 'Copy it now — it will not be shown again.', tone: 'success' });
    } catch (err) {
      push({ title: 'Could not create API key', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setCreatingKey(false);
    }
  };

  const changeTier = async (tier: PlanTier) => {
    setChangingTier(tier);
    try {
      if (status === 'live') {
        await client.subscriptions.create({ tier });
        subRes.reload();
      }
      push({ title: `Upgrade to ${tier} requested`, tone: 'success' });
    } catch (err) {
      push({ title: 'Upgrade failed', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setChangingTier(null);
    }
  };

  const columns: DataTableColumn<OrgMember>[] = [
    { key: 'name', header: 'Member', accessor: (r) => r.user?.displayName ?? r.userId, render: (r) => (
      <div>
        <p className="text-text">{r.user?.displayName ?? r.userId}</p>
        <p className="text-xs text-muted">@{r.user?.handle ?? '—'}</p>
      </div>
    ) },
    {
      key: 'role',
      header: 'Role',
      render: (r) => (
        <Select
          value={r.role}
          onChange={(e) => void changeRole(r.userId, e.target.value as Role)}
          options={ROLE_OPTIONS}
          disabled={r.role === 'owner'}
          className="h-8 w-32 text-xs"
        />
      ),
    },
    { key: 'joined', header: 'Joined', accessor: (r) => r.joinedAt, render: (r) => new Date(r.joinedAt).toLocaleDateString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Settings</h1>
        <p className="text-sm text-muted">Organization members, API access and your subscription.</p>
      </div>

      {(orgRes.mode === 'demo' || membersRes.mode === 'demo') && (
        <div className="flex items-center gap-2 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          <AlertTriangle className="h-3.5 w-3.5" /> Showing offline demo data — the live API at {client.baseUrl} was not reachable.
        </div>
      )}

      <Panel title={`Organization — ${orgRes.data.name}`} padded={false}>
        <div className="border-b border-border p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input label="Invite by email" placeholder="teammate@studio.dev" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="w-64" />
            <Select label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)} options={ROLE_OPTIONS.filter((r) => r.value !== 'owner')} className="w-40" />
            <Button onClick={() => void invite()} loading={inviting}>
              Invite
            </Button>
          </div>
        </div>
        <DataTable columns={columns} rows={membersRes.data} rowKey={(r) => r.userId} loading={membersRes.loading} />
      </Panel>

      <Panel title="API keys">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Full key management, usage and webhooks live in the{' '}
            <a href={DEVELOPER_PORTAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
              Developer Portal <ExternalLink className="h-3 w-3" />
            </a>
            . You can mint a key here for a quick start.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Input label="Key name" placeholder="e.g. CI pipeline" value={keyName} onChange={(e) => setKeyName(e.target.value)} className="w-64" leftIcon={<Key className="h-4 w-4" />} />
            <Button onClick={() => void createKey()} loading={creatingKey}>
              Create key
            </Button>
          </div>
          {createdKey && (
            <div className="flex items-center gap-2 rounded-control border border-success/40 bg-success/10 px-3 py-2 font-hud text-xs text-success">
              <KeyRound className="h-3.5 w-3.5" /> {createdKey}
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Subscription"
        actions={<Badge tone="accent">{subRes.data.status}</Badge>}
      >
        <p className="mb-4 text-sm text-text/80">
          Current plan: <span className="font-semibold text-text">{subRes.data.tier}</span> — renews{' '}
          {new Date(subRes.data.currentPeriodEnd).toLocaleDateString()}.
        </p>
        <PlanTierTable currentTier={subRes.data.tier} onUpgrade={(t) => void changeTier(t)} upgrading={changingTier} />
      </Panel>
    </div>
  );
}
