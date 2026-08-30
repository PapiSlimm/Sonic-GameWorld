'use client';

import { DataTable, type DataTableColumn } from '@sonic-gameworld/ui';
import type { LeaderboardEntry } from '@sonic-gameworld/gameworld-sdk';

const columns: DataTableColumn<LeaderboardEntry>[] = [
  { key: 'rank', header: '#', accessor: (r) => r.rank, width: '56px' },
  { key: 'handle', header: 'Player', render: (r) => <span className="font-medium text-text">{r.handle}</span> },
  { key: 'score', header: 'Score', accessor: (r) => r.score, align: 'right', sortable: true },
];

export function LeaderboardTable({ entries, loading }: { entries: LeaderboardEntry[]; loading?: boolean }) {
  return (
    <DataTable
      columns={columns}
      rows={entries}
      rowKey={(r) => r.playerId}
      loading={loading}
      emptyMessage="No scores submitted yet."
      initialSort={{ key: 'score', dir: 'desc' }}
    />
  );
}
