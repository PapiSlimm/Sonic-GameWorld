'use client';
import { useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Badge, Button, DataTable, Dialog, Input, Select, useToast, type DataTableColumn } from '@sonic-gameworld/ui';
import { formatRelative } from '../../lib/format.js';
import { readOverrideStore, upsertOverride } from '../../lib/overrides.js';
import { ALL_ORG_TIERS, DEMO_ORGS, searchDemoOrgs, updateOrgMemberRole, type AdminOrg, type AdminOrgMember } from '../../lib/orgs.js';
import type { PlanTier, Role } from '@sonic-gameworld/gameworld-sdk';

const OVERRIDE_KEY = 'gw_admin_org_tier_overrides_v1';
const ROLE_OPTIONS: Role[] = ['owner', 'admin', 'editor', 'viewer'];

export default function OrgsPage() {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [overrides, setOverrides] = useState<Record<string, { tier: PlanTier }>>(() => readOverrideStore(OVERRIDE_KEY));
  const [managing, setManaging] = useState<AdminOrg | null>(null);
  const [memberRoles, setMemberRoles] = useState<Record<string, Role>>({});
  const toast = useToast();

  const results = useMemo(() => searchDemoOrgs(query, tierFilter).map((o) => (overrides[o.id] ? { ...o, tier: overrides[o.id]!.tier } : o)), [query, tierFilter, overrides]);

  const openManage = (org: AdminOrg) => {
    setManaging(org);
    setMemberRoles(Object.fromEntries(org.members.map((m) => [m.userId, m.role])));
  };

  const saveTier = (org: AdminOrg, tier: PlanTier) => {
    const next = upsertOverride<{ tier: PlanTier }>(OVERRIDE_KEY, org.id, { tier });
    setOverrides(next);
    toast.push({ title: 'Tier overridden', description: `${org.name} → ${tier} (staged locally — no PATCH /v1/orgs/:id endpoint yet).`, tone: 'success' });
  };

  const saveMemberRole = async (org: AdminOrg, member: AdminOrgMember, role: Role) => {
    setMemberRoles((s) => ({ ...s, [member.userId]: role }));
    try {
      await updateOrgMemberRole(org.id, member.userId, role);
      toast.push({ title: 'Member role updated', description: `${member.displayName} is now ${role} in ${org.name}.`, tone: 'success' });
    } catch (err) {
      toast.push({ title: 'Staged locally', description: err instanceof Error ? err.message : 'API unreachable — change kept in this session only.', tone: 'warn' });
    }
  };

  const columns: DataTableColumn<AdminOrg>[] = [
    { key: 'name', header: 'Organization', render: (r) => (
      <div>
        <div className="text-text">{r.name}</div>
        <div className="text-xs text-muted">/{r.slug}</div>
      </div>
    ) },
    { key: 'tier', header: 'Tier', sortable: true, accessor: (r) => r.tier, render: (r) => <Badge tone="violet">{r.tier}</Badge> },
    { key: 'members', header: 'Members', align: 'right', sortable: true, accessor: (r) => r.memberCount },
    { key: 'created', header: 'Created', sortable: true, accessor: (r) => r.createdAt, render: (r) => <span className="text-xs text-muted">{formatRelative(r.createdAt)}</span> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <Button size="sm" variant="ghost" leftIcon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => openManage(r)}>Manage</Button>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Organizations</h1>
        <p className="text-sm text-muted">Search orgs, manage member roles and override plan tiers.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-72" placeholder="Search by name, slug or org_id…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select className="w-44" options={ALL_ORG_TIERS.map((t) => ({ value: t, label: t }))} placeholder="All tiers" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} />
        <span className="font-hud text-xs text-muted">{results.length} org{results.length === 1 ? '' : 's'} · demo directory ({DEMO_ORGS.length} total)</span>
      </div>

      <DataTable columns={columns} rows={results} rowKey={(r) => r.id} initialSort={{ key: 'created', dir: 'desc' }} />

      <Dialog open={!!managing} onClose={() => setManaging(null)} title={managing?.name} description={managing ? `/${managing.slug}` : undefined} size="lg">
        {managing && (
          <div className="flex flex-col gap-5">
            <Select
              label="Plan tier override"
              options={ALL_ORG_TIERS.map((t) => ({ value: t, label: t }))}
              value={overrides[managing.id]?.tier ?? managing.tier}
              onChange={(e) => saveTier(managing, e.target.value as PlanTier)}
            />
            <div>
              <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Members</span>
              <div className="mt-2 flex flex-col gap-2">
                {managing.members.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between gap-3 rounded-control border border-border bg-bg px-3 py-2">
                    <div>
                      <div className="text-sm text-text">{m.displayName}</div>
                      <div className="text-xs text-muted">@{m.handle}</div>
                    </div>
                    <Select
                      className="w-36"
                      options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
                      value={memberRoles[m.userId] ?? m.role}
                      onChange={(e) => saveMemberRole(managing, m, e.target.value as Role)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
