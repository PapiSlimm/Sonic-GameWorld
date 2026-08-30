import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { WorldLayer } from '@sonic-gameworld/world-schema';
import type { SpatialEngine } from '../engine/SpatialEngine.js';
import { useSpatialEngineContext } from './context.js';
import { headerStyle, panelStyle, rowStyle, TOKENS } from './tokens.js';

export interface LayerPanelProps {
  engine?: SpatialEngine | null;
  className?: string;
  style?: CSSProperties;
  onChange?: (layers: WorldLayer[]) => void;
}

/** Toggles `WorldLayer` visibility (TERRAIN, BUILDINGS, DETECTION, SENSORS, HUD, ...) on the live engine. */
export function LayerPanel({ engine: engineProp, className, style, onChange }: LayerPanelProps) {
  const ctxEngine = useSpatialEngineContext();
  const engine = engineProp ?? ctxEngine;
  const [layers, setLayers] = useState<WorldLayer[]>(() => engine?.getLayers() ?? []);

  useEffect(() => {
    if (!engine) {
      setLayers([]);
      return;
    }
    const sync = () => setLayers(engine.getLayers());
    sync();
    return engine.on('entityChange', (e) => {
      if (e.type === 'load') sync();
    });
  }, [engine]);

  if (!engine) return null;

  const toggle = (id: string, visible: boolean) => {
    engine.setLayerVisible(id, visible);
    const next = engine.getLayers();
    setLayers(next);
    onChange?.(next);
  };

  const sorted = [...layers].sort((a, b) => a.order - b.order);

  return (
    <div className={className} style={{ ...panelStyle, pointerEvents: 'auto', minWidth: 160, ...style }}>
      <div style={headerStyle}>Layers</div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 11, color: TOKENS.textMuted }}>No layers loaded</div>
      ) : (
        sorted.map((layer) => (
          <label key={layer.id} style={{ ...rowStyle, opacity: layer.locked ? 0.5 : 1 }}>
            <input
              type="checkbox"
              checked={layer.visible}
              disabled={layer.locked}
              onChange={(e) => toggle(layer.id, e.target.checked)}
            />
            <span style={{ flex: 1 }}>{layer.name}</span>
            {layer.locked ? <span style={{ fontSize: 10, color: TOKENS.textMuted }}>locked</span> : null}
          </label>
        ))
      )}
    </div>
  );
}
