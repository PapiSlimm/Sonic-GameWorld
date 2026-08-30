import { Database, Radio } from 'lucide-react';
import { Badge } from '@sonic-gameworld/ui';
import type { DataSource } from '../lib/use-live';

export function DataSourceBadge({ source, error }: { source: DataSource; error?: string | null }) {
  if (source === 'live') {
    return (
      <Badge tone="success" title="Live data from the GameWorld API">
        <Radio className="h-3 w-3" /> Live
      </Badge>
    );
  }
  return (
    <Badge tone="warn" title={error ?? 'Showing offline demo data'}>
      <Database className="h-3 w-3" /> Demo data
    </Badge>
  );
}
