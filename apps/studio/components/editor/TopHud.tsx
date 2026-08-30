'use client';

import { useState } from 'react';
import { countByKind, randomUuid, transformAt, vec3, CAMERA_MODES, type CameraMode, type Weather } from '@sonic-gameworld/world-schema';
import type { WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { Badge, Button, Select, Slider, cn } from '@sonic-gameworld/ui';
import {
  Bomb,
  Camera as CameraIcon,
  CircleDot,
  Clock,
  Crosshair,
  Drama,
  Gamepad2,
  Map,
  Orbit,
  Plane,
  Redo2,
  Sparkles,
  Target,
  Undo2,
  Users,
  Video,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useStudioStore } from '../../lib/store';
import { formatTimeOfDay, titleCase } from '../../lib/format';

const CAMERA_ICONS: Record<CameraMode, React.ComponentType<{ className?: string }>> = {
  ORBIT: Orbit,
  FOLLOW: Target,
  CHASE: Crosshair,
  DRONE: Plane,
  FIRST_PERSON: Gamepad2,
  THIRD_PERSON: Users,
  RAIL: Video,
  CRANE: CameraIcon,
  AI_DIRECTOR: Sparkles,
  RTS: Map,
};

const WEATHER_OPTIONS: { value: Weather; label: string }[] = [
  { value: 'CLEAR', label: 'Clear' },
  { value: 'CLOUDS', label: 'Clouds' },
  { value: 'RAIN', label: 'Rain' },
  { value: 'STORM', label: 'Storm' },
  { value: 'SNOW', label: 'Snow' },
  { value: 'FOG', label: 'Fog' },
  { value: 'SANDSTORM', label: 'Sandstorm' },
];

function StatPill({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-control border border-border bg-bg px-2.5 py-1">
      <Icon className="h-3.5 w-3.5 text-muted" />
      <span className="font-hud text-xs tabular-nums text-text">{value}</span>
      <span className="font-hud text-[9px] uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState<string | null>(null);
  return {
    isOpen: (id: string) => open === id,
    toggle: (id: string) => setOpen((o) => (o === id ? null : id)),
    close: () => setOpen(null),
  };
}

export interface TopHudProps {
  document: WorldDocument;
}

export function TopHud({ document }: TopHudProps) {
  const cameraMode = useStudioStore((s) => s.cameraMode);
  const setCameraMode = useStudioStore((s) => s.setCameraMode);
  const setEnvironment = useStudioStore((s) => s.setEnvironment);
  const addEntity = useStudioStore((s) => s.addEntity);
  const offline = useStudioStore((s) => s.offline);
  const dirty = useStudioStore((s) => s.dirty);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const canUndo = useStudioStore((s) => s.canUndo());
  const canRedo = useStudioStore((s) => s.canRedo());
  const popover = usePopover();

  const counts = countByKind(document);

  const spawnEntity = (kind: 'PLAYER_SPAWN' | 'NPC' | 'VEHICLE') => {
    addEntity({
      id: randomUuid(),
      kind,
      name: `${titleCase(kind)} ${document.entities.filter((e) => e.kind === kind).length + 1}`,
      transform: transformAt(vec3().x, 0, 0, 1),
      tags: kind === 'NPC' ? ['spawned'] : [],
      permissions: { ownerId: document.passport.creatorId, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    popover.close();
  };

  const addTrigger = () => {
    addEntity({
      id: randomUuid(),
      kind: 'TRIGGER',
      name: `Event Trigger ${counts.TRIGGER + 1}`,
      transform: transformAt(0, 0, 0, 4),
      tags: ['event'],
      permissions: { ownerId: document.passport.creatorId, editors: [], visibility: 'PRIVATE' },
      metadata: {},
    });
    popover.close();
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-panel px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatPill icon={Users} label="Players" value={counts.PLAYER_SPAWN} />
          <StatPill icon={Drama} label="NPCs" value={counts.NPC} />
          <StatPill icon={Gamepad2} label="Vehicles" value={counts.VEHICLE} />
          <StatPill icon={Zap} label="Events" value={counts.TRIGGER} />
          <StatPill icon={Target} label="Missions" value={document.missions.length} />
          {offline && (
            <Badge tone="warn" dot>
              <WifiOff className="mr-1 h-3 w-3" /> Offline demo
            </Badge>
          )}
          {dirty ? <Badge tone="info">Unsaved</Badge> : <Badge tone="success">Saved</Badge>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-control border border-border bg-bg p-1">
          {CAMERA_MODES.map((mode) => {
            const Icon = CAMERA_ICONS[mode];
            const active = cameraMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setCameraMode(mode)}
                title={titleCase(mode)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 font-hud text-[10px] uppercase tracking-wider transition-colors',
                  active ? 'bg-panel text-accent shadow-glow' : 'text-muted hover:text-text',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{titleCase(mode).replace(' ', ' ')}</span>
              </button>
            );
          })}
        </div>

        <div className="relative flex items-center gap-1.5">
          <PopoverButton id="weather" popover={popover} icon={CircleDot} label={`Weather · ${titleCase(document.environment.weather)}`}>
            <div className="flex w-64 flex-col gap-3 p-3">
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
            </div>
          </PopoverButton>

          <PopoverButton id="time" popover={popover} icon={Clock} label={`Time · ${formatTimeOfDay(document.environment.timeOfDay)}`}>
            <div className="w-64 p-3">
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
          </PopoverButton>

          <PopoverButton id="spawn" popover={popover} icon={Bomb} label="Spawn">
            <div className="flex w-56 flex-col gap-1 p-2">
              <PopoverAction label="Spawn Player Start" onClick={() => spawnEntity('PLAYER_SPAWN')} />
              <PopoverAction label="Spawn NPC" onClick={() => spawnEntity('NPC')} />
              <PopoverAction label="Spawn Vehicle" onClick={() => spawnEntity('VEHICLE')} />
            </div>
          </PopoverButton>

          <PopoverButton id="events" popover={popover} icon={Zap} label={`Events · ${counts.TRIGGER}`}>
            <div className="flex w-64 flex-col gap-2 p-3">
              <p className="text-xs text-muted">{counts.TRIGGER} trigger volume(s) in this world.</p>
              <Button size="sm" variant="secondary" onClick={addTrigger}>
                + Add Event Trigger
              </Button>
            </div>
          </PopoverButton>
        </div>
      </div>
    </div>
  );
}

function PopoverButton({
  id,
  popover,
  icon: Icon,
  label,
  children,
}: {
  id: string;
  popover: ReturnType<typeof usePopover>;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  const open = popover.isOpen(id);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => popover.toggle(id)}
        className={cn(
          'flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 font-hud text-[10px] uppercase tracking-wider transition-colors',
          open ? 'border-accent2/50 bg-accent2/10 text-accent2' : 'bg-bg text-muted hover:text-text',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 rounded-panel border border-border bg-panel shadow-panel" onMouseLeave={popover.close}>
          {children}
        </div>
      )}
    </div>
  );
}

function PopoverAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-control px-2.5 py-1.5 text-left text-sm text-text/90 hover:bg-bg">
      {label}
    </button>
  );
}
