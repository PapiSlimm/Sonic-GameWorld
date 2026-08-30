import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { WEATHERS, type Weather, type WorldEnvironment } from '@sonic-gameworld/world-schema';
import type { SpatialEngine } from '../engine/SpatialEngine.js';
import { useSpatialEngineContext } from './context.js';
import { buttonStyle, fieldStyle, panelStyle, selectStyle } from './tokens.js';

export interface WorldControlBarProps {
  engine?: SpatialEngine | null;
  className?: string;
  style?: CSSProperties;
  onChange?: (env: WorldEnvironment) => void;
  /** Shown only when provided — spawning/authoring an entity is app-specific (needs an asset/catalog picker),
   * so this bar delegates it rather than faking a no-op button. */
  onRequestSpawn?: () => void;
  /** Shown only when provided — same rationale as `onRequestSpawn`, for world/mission events. */
  onRequestEvent?: () => void;
}

/** WEATHER + TIME controls for the loaded world's `WorldEnvironment`, plus optional SPAWN/EVENTS actions (§12). */
export function WorldControlBar({ engine: engineProp, className, style, onChange, onRequestSpawn, onRequestEvent }: WorldControlBarProps) {
  const ctxEngine = useSpatialEngineContext();
  const engine = engineProp ?? ctxEngine;
  const [env, setEnv] = useState<WorldEnvironment | null>(() => engine?.getEnvironment() ?? null);

  useEffect(() => {
    if (!engine) {
      setEnv(null);
      return;
    }
    setEnv(engine.getEnvironment());
    return engine.on('entityChange', (e) => {
      if (e.type === 'load') setEnv(engine.getEnvironment());
    });
  }, [engine]);

  if (!engine || !env) return null;

  const setWeather = (weather: Weather) => {
    engine.setEnvironment({ weather });
    const next = engine.getEnvironment();
    setEnv(next);
    onChange?.(next);
  };

  const setTimeOfDay = (timeOfDay: number) => {
    engine.setEnvironment({ timeOfDay });
    const next = engine.getEnvironment();
    setEnv(next);
    onChange?.(next);
  };

  return (
    <div className={className} style={{ ...panelStyle, pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 14, ...style }}>
      <label style={fieldStyle}>
        <span>Weather</span>
        <select style={selectStyle} value={env.weather} onChange={(e) => setWeather(e.target.value as Weather)}>
          {WEATHERS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldStyle}>
        <span>Time — {env.timeOfDay.toFixed(1)}h</span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.1}
          value={env.timeOfDay}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
        />
      </label>
      {onRequestSpawn ? (
        <button type="button" style={buttonStyle(false)} onClick={onRequestSpawn}>
          Spawn
        </button>
      ) : null}
      {onRequestEvent ? (
        <button type="button" style={buttonStyle(false)} onClick={onRequestEvent}>
          Events
        </button>
      ) : null}
    </div>
  );
}
