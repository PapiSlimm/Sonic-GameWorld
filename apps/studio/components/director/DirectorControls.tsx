'use client';

import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { CAMERA_MODES, randomUuid, transformAt, type CameraMode, type Weather } from '@sonic-gameworld/world-schema';
import { Badge, Button, Panel, Select, Slider, cn } from '@sonic-gameworld/ui';
import { Plus } from 'lucide-react';
import { useStudioStore } from '../../lib/store';
import { formatTimeOfDay, titleCase } from '../../lib/format';

const WEATHER_OPTIONS: { value: Weather; label: string }[] = [
  { value: 'CLEAR', label: 'Clear' },
  { value: 'CLOUDS', label: 'Clouds' },
  { value: 'RAIN', label: 'Rain' },
  { value: 'STORM', label: 'Storm' },
  { value: 'SNOW', label: 'Snow' },
  { value: 'FOG', label: 'Fog' },
  { value: 'SANDSTORM', label: 'Sandstorm' },
];

export interface DirectorControlsProps {
  document: WorldDocument;
}

export function DirectorControls({ document }: DirectorControlsProps) {
  const cameraMode = useStudioStore((s) => s.cameraMode);
  const setCameraMode = useStudioStore((s) => s.setCameraMode);
  const setEnvironment = useStudioStore((s) => s.setEnvironment);
  const addEntity = useStudioStore((s) => s.addEntity);
  const trackedEntityId = useStudioStore((s) => s.trackedEntityId);

  const triggers = document.entities.filter((e) => e.kind === 'TRIGGER');
  const trackedEntity = document.entities.find((e) => e.id === trackedEntityId);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel title="Camera">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5">
            {CAMERA_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setCameraMode(mode as CameraMode)}
                className={cn(
                  'rounded-control border px-2 py-1.5 font-hud text-[10px] uppercase tracking-wider transition-colors',
                  cameraMode === mode ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-bg text-muted hover:text-text',
                )}
              >
                {titleCase(mode)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {trackedEntity ? (
              <>
                Tracking <span className="text-text/80">{trackedEntity.name}</span>
              </>
            ) : (
              'Not tracking any entity — use the World table to follow one.'
            )}
          </p>
        </div>
      </Panel>

      <Panel
        title="Events"
        actions={
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() =>
              addEntity({
                id: randomUuid(),
                kind: 'TRIGGER',
                name: `Event Trigger ${triggers.length + 1}`,
                transform: transformAt(0, 0, 0, 4),
                tags: ['event'],
                permissions: { ownerId: document.passport.creatorId, editors: [], visibility: 'PRIVATE' },
                metadata: {},
              })
            }
          >
            New
          </Button>
        }
      >
        {triggers.length === 0 ? (
          <p className="text-xs text-muted">No event triggers yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {triggers.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-xs">
                <span className="text-text/85">{t.name}</span>
                <Badge tone="default">{document.missions.some((m) => m.triggers.some((tr) => tr.entityId === t.id)) ? 'Linked' : 'Unlinked'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Weather & Time">
        <div className="flex flex-col gap-3">
          <Select
            label="Weather"
            value={document.environment.weather}
            options={WEATHER_OPTIONS}
            onChange={(e) => setEnvironment({ weather: e.target.value as Weather })}
          />
          <Slider
            label="Intensity"
            value={document.environment.weatherIntensity}
            min={0}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setEnvironment({ weatherIntensity: v })}
          />
          <Slider
            label="Time of day"
            value={document.environment.timeOfDay}
            min={0}
            max={24}
            step={0.25}
            format={formatTimeOfDay}
            onChange={(v) => setEnvironment({ timeOfDay: v })}
          />
        </div>
      </Panel>
    </div>
  );
}
