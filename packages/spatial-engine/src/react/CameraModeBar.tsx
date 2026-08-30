import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { CAMERA_MODES, type CameraMode } from '@sonic-gameworld/world-schema';
import type { SpatialEngine } from '../engine/SpatialEngine.js';
import { useSpatialEngineContext } from './context.js';
import { buttonStyle, panelStyle } from './tokens.js';

export interface CameraModeBarProps {
  engine?: SpatialEngine | null;
  /** Subset/order of modes to show. Default: all 9 `CameraMode`s in schema order. */
  modes?: CameraMode[];
  className?: string;
  style?: CSSProperties;
  onChange?: (mode: CameraMode) => void;
}

/** Button row for the 9 camera modes (ORBIT/FOLLOW/CHASE/DRONE/FIRST_PERSON/THIRD_PERSON/RAIL/CRANE/AI_DIRECTOR). */
export function CameraModeBar({ engine: engineProp, modes = CAMERA_MODES, className, style, onChange }: CameraModeBarProps) {
  const ctxEngine = useSpatialEngineContext();
  const engine = engineProp ?? ctxEngine;
  const [mode, setMode] = useState<CameraMode>(() => engine?.getCameraMode() ?? 'ORBIT');

  useEffect(() => {
    if (!engine) return;
    setMode(engine.getCameraMode());
    return engine.on('cameraChange', (e) => setMode(e.mode));
  }, [engine]);

  if (!engine) return null;

  const handleClick = (m: CameraMode) => {
    engine.setCameraMode(m);
    onChange?.(m);
  };

  return (
    <div className={className} style={{ ...panelStyle, pointerEvents: 'auto', display: 'inline-flex', gap: 4, flexWrap: 'wrap', ...style }}>
      {modes.map((m) => (
        <button key={m} type="button" style={buttonStyle(mode === m)} onClick={() => handleClick(m)}>
          {m.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}
