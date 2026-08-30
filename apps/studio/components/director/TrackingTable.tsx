'use client';

import { useMemo, useState } from 'react';
import type { WorldDocument, WorldEntity } from '@sonic-gameworld/gameworld-sdk';
import { Badge, Button, DataTable, Tabs, type DataTableColumn } from '@sonic-gameworld/ui';
import { Crosshair, Radar } from 'lucide-react';
import { entityKindIcon } from '../../lib/icons';
import { useStudioStore } from '../../lib/store';

type Category = 'ALL' | 'PLAYER' | 'NPC' | 'EVENT';

function categoryOf(kind: WorldEntity['kind']): Category | undefined {
  if (kind === 'PLAYER_SPAWN') return 'PLAYER';
  if (kind === 'NPC') return 'NPC';
  if (kind === 'TRIGGER') return 'EVENT';
  return undefined;
}

export interface TrackingTableProps {
  document: WorldDocument;
}

export function TrackingTable({ document }: TrackingTableProps) {
  const [category, setCategory] = useState<Category>('ALL');
  const trackedEntityId = useStudioStore((s) => s.trackedEntityId);
  const setTrackedEntity = useStudioStore((s) => s.setTrackedEntity);
  const select = useStudioStore((s) => s.select);

  const rows = useMemo(
    () =>
      document.entities
        .map((e) => ({ entity: e, category: categoryOf(e.kind) }))
        .filter((r): r is { entity: WorldEntity; category: Category } => Boolean(r.category))
        .filter((r) => category === 'ALL' || r.category === category),
    [document.entities, category],
  );

  const columns: DataTableColumn<{ entity: WorldEntity; category: Category }>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      accessor: (r) => r.entity.name,
      render: (r) => {
        const Icon = entityKindIcon(r.entity.kind);
        return (
          <span className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted" />
            {r.entity.name}
          </span>
        );
      },
    },
    { key: 'category', header: 'Type', accessor: (r) => r.category, render: (r) => <Badge tone="default">{r.category}</Badge> },
    {
      key: 'position',
      header: 'Position',
      render: (r) => (
        <span className="font-hud text-xs tabular-nums text-muted">
          {r.entity.transform.position.x.toFixed(1)}, {r.entity.transform.position.y.toFixed(1)}, {r.entity.transform.position.z.toFixed(1)}
        </span>
      ),
    },
    {
      key: 'faction',
      header: 'Faction / Behavior',
      render: (r) => <span className="text-xs text-muted">{String(r.entity.behavior?.params?.faction ?? r.entity.behavior?.systemId ?? '—')}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => select([r.entity.id])} title="Select in scene">
            <Radar className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant={trackedEntityId === r.entity.id ? 'primary' : 'secondary'}
            onClick={() => setTrackedEntity(trackedEntityId === r.entity.id ? null : r.entity.id)}
            leftIcon={<Crosshair className="h-3.5 w-3.5" />}
          >
            {trackedEntityId === r.entity.id ? 'Following' : 'Follow'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
        <Tabs.List>
          <Tabs.Trigger value="ALL">All ({document.entities.filter((e) => categoryOf(e.kind)).length})</Tabs.Trigger>
          <Tabs.Trigger value="PLAYER">Players</Tabs.Trigger>
          <Tabs.Trigger value="NPC">NPCs</Tabs.Trigger>
          <Tabs.Trigger value="EVENT">Events</Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.entity.id} emptyMessage="Nothing in this category yet." />
    </div>
  );
}
