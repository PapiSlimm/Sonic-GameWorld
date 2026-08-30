import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { EntityKind, WorldEntity } from '@sonic-gameworld/world-schema';
import type { SpatialEngine } from '../engine/SpatialEngine.js';
import { useSpatialEngineContext } from './context.js';
import { buttonStyle, headerStyle, panelStyle, TOKENS } from './tokens.js';

const DEFAULT_KINDS: EntityKind[] = ['NPC', 'VEHICLE', 'PLAYER_SPAWN', 'CAMERA'];

export interface TrackingPanelProps {
  engine?: SpatialEngine | null;
  /** Entity kinds listed as trackable. Default: NPC, VEHICLE, PLAYER_SPAWN, CAMERA. */
  kinds?: EntityKind[];
  className?: string;
  style?: CSSProperties;
  onTrack?: (id: string | null) => void;
}

/** Lists trackable entities and lets the user set/clear `SpatialEngine.track()`. */
export function TrackingPanel({ engine: engineProp, kinds = DEFAULT_KINDS, className, style, onTrack }: TrackingPanelProps) {
  const ctxEngine = useSpatialEngineContext();
  const engine = engineProp ?? ctxEngine;
  const [tracked, setTracked] = useState<string | null>(() => engine?.getTracked() ?? null);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const kindsKey = kinds.join(',');

  useEffect(() => {
    if (!engine) {
      setEntities([]);
      setTracked(null);
      return;
    }
    const sync = () => {
      const doc = engine.document;
      setEntities(doc ? doc.entities.filter((e) => kinds.includes(e.kind)) : []);
      setTracked(engine.getTracked());
    };
    sync();
    const offLoad = engine.on('entityChange', (e) => {
      if (e.type === 'load' || e.type === 'spawn' || e.type === 'remove') sync();
    });
    const offCam = engine.on('cameraChange', () => setTracked(engine.getTracked()));
    return () => {
      offLoad();
      offCam();
    };
    // `kinds` is captured through `kindsKey` to avoid re-subscribing on every render with a fresh array literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, kindsKey]);

  const sortedEntities = useMemo(() => [...entities].sort((a, b) => a.name.localeCompare(b.name)), [entities]);

  if (!engine) return null;

  const handleTrack = (id: string | null) => {
    engine.track(id);
    setTracked(id);
    onTrack?.(id);
  };

  return (
    <div className={className} style={{ ...panelStyle, pointerEvents: 'auto', minWidth: 180, maxHeight: 280, overflowY: 'auto', ...style }}>
      <div style={headerStyle}>Tracking</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" style={buttonStyle(tracked === null)} onClick={() => handleTrack(null)}>
          None
        </button>
        {sortedEntities.length === 0 ? (
          <div style={{ fontSize: 11, color: TOKENS.textMuted, padding: '4px 0' }}>No trackable entities</div>
        ) : (
          sortedEntities.map((entity) => (
            <button key={entity.id} type="button" style={buttonStyle(tracked === entity.id)} onClick={() => handleTrack(entity.id)}>
              {entity.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
