import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { SpatialEngine } from '../engine/SpatialEngine.js';
import type { HUDState } from '../types.js';
import { useSpatialEngineContext } from './context.js';
import { TOKENS, panelStyle } from './tokens.js';

export interface HUDProps {
  /** Explicit engine, for use outside a `<SpatialViewport>`. Falls back to the nearest viewport's engine via context. */
  engine?: SpatialEngine | null;
  className?: string;
  style?: CSSProperties;
  /** Minimum ms between re-renders (default 200 = 5/s) — the engine ticks at frame rate, this UI shouldn't. */
  refreshMs?: number;
}

/** HUD overlay: camera mode, fps, entity counts, tracked entity, active cinematic — mirrors `SpatialEngine.getHUDState()`. */
export function HUD({ engine: engineProp, className, style, refreshMs = 200 }: HUDProps) {
  const ctxEngine = useSpatialEngineContext();
  const engine = engineProp ?? ctxEngine;
  const [hud, setHud] = useState<HUDState | null>(() => engine?.getHUDState() ?? null);

  useEffect(() => {
    if (!engine) {
      setHud(null);
      return;
    }
    setHud(engine.getHUDState());
    let last = 0;
    return engine.on('tick', () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - last < refreshMs) return;
      last = now;
      setHud(engine.getHUDState());
    });
  }, [engine, refreshMs]);

  if (!hud) return null;

  return (
    <div className={className} style={{ ...panelStyle, pointerEvents: 'auto', display: 'inline-flex', gap: 16, ...style }}>
      <Stat label="Mode" value={hud.mode.replace(/_/g, ' ')} />
      <Stat label="FPS" value={hud.fps.toFixed(0)} accent={hud.fps < 30 ? TOKENS.warn : undefined} />
      <Stat label="Players" value={hud.counts.players} />
      <Stat label="NPCs" value={hud.counts.npcs} />
      <Stat label="Vehicles" value={hud.counts.vehicles} />
      <Stat label="Events" value={hud.counts.events} />
      <Stat label="Missions" value={hud.counts.missions} />
      <Stat label="Weather" value={hud.weather} />
      <Stat label="Time" value={`${hud.timeOfDay.toFixed(1)}h`} />
      {hud.tracked ? <Stat label="Tracking" value={hud.tracked.slice(0, 8)} accent={TOKENS.accent} /> : null}
      {hud.cinematic.playing ? <Stat label="Cinematic" value={`shot ${hud.cinematic.shotIndex + 1}`} accent={TOKENS.accent2} /> : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 46 }}>
      <span style={{ fontFamily: TOKENS.mono, fontSize: 9, letterSpacing: '0.12em', color: TOKENS.textMuted, textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: TOKENS.mono, fontSize: 13, color: accent ?? TOKENS.text }}>{value}</span>
    </div>
  );
}
