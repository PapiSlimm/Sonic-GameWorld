'use client';

import { useState } from 'react';
import { Panel } from '@sonic-gameworld/ui';
import { RigList } from '../../../../components/cinematics/RigList';
import { SequenceTimeline } from '../../../../components/cinematics/SequenceTimeline';
import { ViewportPane } from '../../../../components/editor/ViewportPane';
import { useStudioStore } from '../../../../lib/store';

export default function CinematicsPage() {
  const document = useStudioStore((s) => s.document);
  const cinematicSequences = useStudioStore((s) => s.cinematicSequences);
  const selection = useStudioStore((s) => s.selection);
  const hoveredId = useStudioStore((s) => s.hoveredId);
  const cameraMode = useStudioStore((s) => s.cameraMode);
  const trackedEntityId = useStudioStore((s) => s.trackedEntityId);
  const select = useStudioStore((s) => s.select);
  const setHovered = useStudioStore((s) => s.setHovered);
  const updateEntity = useStudioStore((s) => s.updateEntity);
  const [selectedRigId, setSelectedRigId] = useState<string | null>(null);

  if (!document) return null;

  return (
    <div className="grid h-full grid-cols-[240px_1fr_420px] overflow-hidden">
      <Panel title="Camera Rigs" padded={false} className="flex flex-col overflow-hidden rounded-none border-y-0 border-l-0">
        <RigList document={document} selectedId={selectedRigId} onSelect={setSelectedRigId} />
      </Panel>
      <ViewportPane
        world={document}
        selection={selection}
        hoveredId={hoveredId}
        cameraMode={cameraMode}
        trackedEntityId={trackedEntityId}
        onSelect={select}
        onHover={setHovered}
        onEntityChange={(id, patch) => updateEntity(id, patch)}
      />
      <Panel title="Timeline" padded={false} className="flex flex-col overflow-hidden rounded-none border-y-0 border-r-0">
        <SequenceTimeline document={document} sequences={cinematicSequences} />
      </Panel>
    </div>
  );
}
