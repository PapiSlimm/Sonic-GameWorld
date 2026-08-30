'use client';

import type { CameraRig, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { CAMERA_MODES, randomUuid, transformAt, type CameraMode } from '@sonic-gameworld/world-schema';
import { Button, Select, cn } from '@sonic-gameworld/ui';
import { Plus, Trash2, Video } from 'lucide-react';
import { useStudioStore } from '../../lib/store';

export interface RigListProps {
  document: WorldDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RigList({ document, selectedId, onSelect }: RigListProps) {
  const addCameraRig = useStudioStore((s) => s.addCameraRig);
  const removeCameraRig = useStudioStore((s) => s.removeCameraRig);

  const createRig = () => {
    const rig: CameraRig = {
      id: randomUuid(),
      name: `Rig ${document.cameras.length + 1}`,
      mode: 'CRANE',
      keyframes: [
        { t: 0, transform: transformAt(0, 40, 60, 1), fov: 45 },
        { t: 4, transform: transformAt(20, 20, 0, 1), fov: 35 },
      ],
      params: { distance: 30, height: 40, damping: 0.15, fov: 45 },
    };
    addCameraRig(rig);
    onSelect(rig.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">Rigs ({document.cameras.length})</span>
        <Button size="sm" variant="secondary" onClick={createRig} leftIcon={<Plus className="h-3.5 w-3.5" />}>
          New
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {document.cameras.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted">No camera rigs yet.</p>
        ) : (
          document.cameras.map((rig) => (
            <div
              key={rig.id}
              className={cn(
                'group flex items-center gap-2 rounded-control px-2.5 py-2 text-sm transition-colors',
                selectedId === rig.id ? 'bg-accent2/10 text-accent2' : 'text-text/85 hover:bg-bg',
              )}
            >
              <button type="button" onClick={() => onSelect(rig.id)} className="flex flex-1 items-center gap-2 truncate text-left">
                <Video className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="truncate">{rig.name}</span>
                <span className="ml-auto shrink-0 font-hud text-[9px] uppercase text-muted">{rig.mode}</span>
              </button>
              <button type="button" onClick={() => removeCameraRig(rig.id)} className="hidden text-muted hover:text-danger group-hover:block">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      {selectedId && (
        <div className="border-t border-border p-3">
          <Select
            label="Mode"
            value={document.cameras.find((r) => r.id === selectedId)?.mode ?? 'ORBIT'}
            options={CAMERA_MODES.map((m) => ({ value: m, label: m }))}
            onChange={(e) => useStudioStore.getState().updateCameraRig(selectedId, { mode: e.target.value as CameraMode })}
          />
        </div>
      )}
    </div>
  );
}
