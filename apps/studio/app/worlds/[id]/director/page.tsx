'use client';

import { Panel } from '@sonic-gameworld/ui';
import { DirectorControls } from '../../../../components/director/DirectorControls';
import { TrackingTable } from '../../../../components/director/TrackingTable';
import { useStudioStore } from '../../../../lib/store';

export default function DirectorModePage() {
  const document = useStudioStore((s) => s.document);
  if (!document) return null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <Panel title="World — Player / NPC / Event Tracking">
        <TrackingTable document={document} />
      </Panel>
      <Panel title="Director" padded={false} className="p-4">
        <DirectorControls document={document} />
      </Panel>
    </div>
  );
}
