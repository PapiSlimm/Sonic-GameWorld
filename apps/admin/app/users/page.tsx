'use client';
import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge, Button, DataTable, Dialog, Input, Select, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { formatRelative } from '../../lib/format.js';
import { readOverrideStore, upsertOverride } from '../../lib/overrides.js';
import { tryFetchUserById, searchDemoUsers, ALL_ROLES, ALL_TIERS, type AdminUser } from '../../lib/users.js';
import type { Role, PlanTier } from '@sonic-gameworld/gameworld-sdk';

interface UserOverride { tier: PlanTier; roles: Role[] }
const OVERRIDE_KEY = 'gw_admin_user_overrides_v1';

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [overrides, setOverrides] = useState<Record<string, UserOverride>>(() => readOverrideStore(OVERRIDE_KEY));
  const [liveHit, setLiveHit] = useState<AdminUser | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draftTier, setDraftTier] = useState<PlanTier>('STARTER');
  const [draftRoles, setDraftRoles] = useState<Set<Role>>(new Set());
  const toast = useToast();

  const results = useMemo(() => {
    const demoResults = searchDemoUsers(query, tierFilter, roleFilter);
    const base = liveHit && !demoResults.some((u) => u.id === liveHit.id) ? [liveHit, ...demoResults] : demoResults;
    return base.map((u) => (overrides[u.id] ? { ...u, tier: overrides[u.id]!.tier, roles: overrides[u.id]!.roles } : u));
  }, [query, tierFilter, roleFilter, overrides, liveHit]);

  const runSearch = async (value: string) => {
    setQuery(value);
    if (/^user_[a-z0-9]+$/i.test(value.trim())) {
      const hit = await tryFetchUserById(value.trim());
      setLiveHit(hit ? { ...hit, lastActiveAt: hit.updatedAt } : null);
    } else {
      setLiveHit(null);
    }
  };

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setDraftTier(u.tier);
    setDraftRoles(new Set(u.roles));
  };

  const save = () => {
    if (!editing) return;
    const next = upsertOverride<UserOverride>(OVERRIDE_KEY, editing.id, { tier: draftTier, roles: Array.from(draftRoles) });
    setOverrides(next);
    toast.push({ title: 'User updated', description: `${editing.displayName} — staged locally (UserPatch has no role/tier field yet; see README).`, tone: 'success' });
    setEditing(null);
  };

  const columns: DataTableColumn<AdminUser>[] = [
    { key: 'user', header: 'User', render: (r) => (
      <div>
        <div className="text-text">{r.displayName}</div>
        <div className="text-xs text-muted">{r.email}</div>
      </div>
    ) },
    { key: 'org', header: 'Org', render: (r) => r.orgName ?? <span className="text-muted">—</span> },
    { key: 'tier', header: 'Tier', sortable: true, accessor: (r) => r.tier, render: (r) => <Badge tone="violet">{r.tier}</Badge> },
    { key: 'roles', header: 'Roles', render: (r) => (
      <div className="flex flex-wrap gap-1">{r.roles.map((role) => <Badge key={role} tone="default">{role}</Badge>)}</div>
    ) },
    { key: 'verified', header: 'Verified', align: 'center', render: (r) => (r.emailVerified ? <Badge tone="success">yes</Badge> : <Badge tone="warn">no</Badge>) },
    { key: 'active', header: 'Last active', sortable: true, accessor: (r) => r.lastActiveAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.lastActiveAt)}</span> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <Button size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(r)}>Edit</Button>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Users</h1>
        <p className="text-sm text-muted">Search accounts, adjust plan tier and platform roles.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-72" placeholder="Search by name, email, handle or user_id…" value={query} onChange={(e) => runSearch(e.target.value)} />
        <Select className="w-40" options={ALL_TIERS.map((t) => ({ value: t, label: t }))} placeholder="All tiers" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} />
        <Select className="w-40" options={ALL_ROLES.map((r) => ({ value: r, label: r }))} placeholder="All roles" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} />
        <span className="font-hud text-xs text-muted">{results.length} user{results.length === 1 ? '' : 's'}</span>
      </div>

      <DataTable columns={columns} rows={results} rowKey={(r) => r.id} initialSort={{ key: 'active', dir: 'desc' }} />

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.displayName}
        description={editing?.email}
        footer={<Button onClick={save}>Save changes</Button>}
      >
        <div className="flex flex-col gap-4">
          <Select label="Plan tier" options={ALL_TIERS.map((t) => ({ value: t, label: t }))} value={draftTier} onChange={(e) => setDraftTier(e.target.value as PlanTier)} />
          <div>
            <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Roles</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_ROLES.map((role) => {
                const active = draftRoles.has(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setDraftRoles((prev) => {
                        const next = new Set(prev);
                        if (next.has(role)) next.delete(role);
                        else next.add(role);
                        return next;
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
                  >
                    {role}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
