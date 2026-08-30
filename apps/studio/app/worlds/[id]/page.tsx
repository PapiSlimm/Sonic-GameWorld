'use client';

import { Panel } from '@sonic-gameworld/ui';
import { SceneTree } from '../../../components/editor/SceneTree';
import { Inspector } from '../../../components/editor/Inspector';
import { TopHud } from '../../../components/editor/TopHud';
import { ViewportPane } from '../../../components/editor/ViewportPane';
import { useStudioStore } from '../../../lib/store';

export default function WorldEditorPage() {
  const document = useStudioStore((s) => s.document);
  const selection = useStudioStore((s) => s.selection);
  const hoveredId = useStudioStore((s) => s.hoveredId);
  const cameraMode = useStudioStore((s) => s.cameraMode);
  const trackedEntityId = useStudioStore((s) => s.trackedEntityId);
  const select = useStudioStore((s) => s.select);
  const setHovered = useStudioStore((s) => s.setHovered);
  const updateEntity = useStudioStore((s) => s.updateEntity);

  if (!document) return null;

  const primarySelected = document.entities.find((e) => e.id === selection[0]);

  return (
    <div className="flex h-full flex-col">
      <TopHud document={document} />
      <div className="grid flex-1 grid-cols-[260px_1fr_320px] overflow-hidden">
        <Panel title="Scene Hierarchy" padded={false} className="flex flex-col overflow-hidden rounded-none border-y-0 border-l-0">
          <SceneTree document={document} />
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
        <Panel title="Inspector" padded={false} className="flex flex-col overflow-hidden rounded-none border-y-0 border-r-0">
          <Inspector document={document} entity={primarySelected} />
        </Panel>
      </div>
    </div>
  );
}
