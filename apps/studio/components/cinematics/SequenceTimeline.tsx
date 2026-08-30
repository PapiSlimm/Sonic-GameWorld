'use client';

import { useEffect, useRef, useState } from 'react';
import type { CameraRig, CinematicSequence, WorldDocument } from '@sonic-gameworld/gameworld-sdk';
import { randomUuid, type ShotTransition } from '@sonic-gameworld/world-schema';
import { Badge, Button, cn } from '@sonic-gameworld/ui';
import { Pause, Play, Plus, Trash2 } from 'lucide-react';
import { useStudioStore } from '../../lib/store';

const TRANSITIONS: ShotTransition[] = ['CUT', 'FADE', 'DISSOLVE', 'WIPE'];

export interface SequenceTimelineProps {
  document: WorldDocument;
  sequences: CinematicSequence[];
}

export function SequenceTimeline({ document, sequences }: SequenceTimelineProps) {
  const addSequence = useStudioStore((s) => s.addSequence);
  const updateSequence = useStudioStore((s) => s.updateSequence);
  const removeSequence = useStudioStore((s) => s.removeSequence);
  const setCameraMode = useStudioStore((s) => s.setCameraMode);
  const setTrackedEntity = useStudioStore((s) => s.setTrackedEntity);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [shotIndex, setShotIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rigById = (id: string) => document.cameras.find((r) => r.id === id);

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPlayingId(null);
    setShotIndex(0);
  };

  const playFrom = (seq: CinematicSequence, index: number) => {
    if (index >= seq.shots.length) {
      stop();
      return;
    }
    const shot = seq.shots[index]!;
    const rig = rigById(shot.rigId);
    if (rig) {
      setCameraMode(rig.mode);
      setTrackedEntity(rig.targetEntityId ?? null);
    }
    setShotIndex(index);
    timerRef.current = setTimeout(() => playFrom(seq, index + 1), Math.max(300, shot.durationS * 1000));
  };

  const play = (seq: CinematicSequence) => {
    if (playingId === seq.id) {
      stop();
      return;
    }
    stop();
    setPlayingId(seq.id);
    playFrom(seq, 0);
  };

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const createSequence = () => {
    const seq: CinematicSequence = {
      id: randomUuid(),
      name: `Sequence ${sequences.length + 1}`,
      shots: document.cameras[0] ? [{ rigId: document.cameras[0].id, durationS: 4, transition: 'FADE' }] : [],
    };
    addSequence(seq);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <span className="font-hud text-[11px] uppercase tracking-[0.2em] text-muted">Cinematic Sequences</span>
        <Button size="sm" variant="secondary" onClick={createSequence} leftIcon={<Plus className="h-3.5 w-3.5" />}>
          New sequence
        </Button>
      </div>

      {sequences.length === 0 ? (
        <p className="rounded-panel border border-dashed border-border p-6 text-center text-xs text-muted">
          No sequences yet — add camera rigs, then build a shot list here.
        </p>
      ) : (
        sequences.map((seq) => (
          <div key={seq.id} className="rounded-panel border border-border bg-panel p-3">
            <div className="flex items-center justify-between gap-2">
              <input
                value={seq.name}
                onChange={(e) => updateSequence(seq.id, { name: e.target.value })}
                className="h-8 flex-1 rounded-control border border-border bg-bg px-2 text-sm text-text"
              />
              <Button size="sm" variant={playingId === seq.id ? 'primary' : 'secondary'} onClick={() => play(seq)} leftIcon={playingId === seq.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}>
                {playingId === seq.id ? 'Stop' : 'Play in viewport'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={document.cameras.length === 0}
                onClick={() => updateSequence(seq.id, { shots: [...seq.shots, { rigId: document.cameras[0]!.id, durationS: 3, transition: 'CUT' }] })}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                Shot
              </Button>
              <Button size="sm" variant="ghost" onClick={() => removeSequence(seq.id)}>
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {seq.shots.map((shot, i) => {
                const rig = rigById(shot.rigId);
                const active = playingId === seq.id && shotIndex === i;
                return (
                  <div
                    key={`${shot.rigId}-${i}`}
                    className={cn(
                      'flex min-w-[160px] shrink-0 flex-col gap-1.5 rounded-control border p-2.5',
                      active ? 'border-accent bg-accent/10' : 'border-border bg-bg',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <select
                        value={shot.rigId}
                        onChange={(e) => {
                          const shots = seq.shots.map((s, idx) => (idx === i ? { ...s, rigId: e.target.value } : s));
                          updateSequence(seq.id, { shots });
                        }}
                        className="h-6 flex-1 truncate rounded-control border border-border bg-panel px-1.5 text-[10px] text-text"
                      >
                        {document.cameras.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => updateSequence(seq.id, { shots: seq.shots.filter((_, idx) => idx !== i) })}
                        className="ml-1 text-muted hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <Badge tone="default">{rig?.mode ?? '—'}</Badge>
                    <label className="flex items-center justify-between text-[10px] text-muted">
                      Duration
                      <input
                        type="number"
                        min={1}
                        value={shot.durationS}
                        onChange={(e) => {
                          const shots = seq.shots.map((s, idx) => (idx === i ? { ...s, durationS: Number(e.target.value) } : s));
                          updateSequence(seq.id, { shots });
                        }}
                        className="h-6 w-14 rounded-control border border-border bg-panel px-1.5 text-right text-[10px] text-text"
                      />
                    </label>
                    <select
                      value={shot.transition}
                      onChange={(e) => {
                        const shots = seq.shots.map((s, idx) => (idx === i ? { ...s, transition: e.target.value as ShotTransition } : s));
                        updateSequence(seq.id, { shots });
                      }}
                      className="h-6 rounded-control border border-border bg-panel px-1.5 text-[10px] text-text"
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
