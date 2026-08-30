import { useEffect, useRef, useState, type RefObject } from 'react';
import { SpatialEngine } from '../engine/SpatialEngine.js';
import type { SpatialEngineOptions } from '../types.js';

export interface UseSpatialEngineOptions
  extends Omit<SpatialEngineOptions, 'canvas' | 'renderer' | 'width' | 'height'> {}

export interface UseSpatialEngineResult {
  /** Attach to the element that sizes the viewport (a `ResizeObserver` keeps the engine in sync with it). */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Attach to the `<canvas>` the engine renders into. */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** `null` until mounted client-side (SSR) and while the canvas/container refs are not yet attached. */
  engine: SpatialEngine | null;
}

/**
 * Framework-agnostic core wrapped for React: creates one `SpatialEngine` on mount (client-only —
 * SSR-safe, returns `engine: null` until the browser effect runs), starts its render loop, keeps it
 * sized to `containerRef` via `ResizeObserver`, and disposes it on unmount.
 *
 * Constructor-only options (`cdnBaseUrl`, `background`, `antialias`, `pixelRatio`, `resolveAssetUrl`,
 * `onError`) are read once at mount time; changing them afterwards has no effect on the live engine —
 * remount (e.g. via a `key` prop) to apply new ones. `loadWorld`, camera mode, layers, environment,
 * selection and tracking are all mutable afterwards through the returned `engine` instance.
 */
export function useSpatialEngine(options: UseSpatialEngineOptions = {}): UseSpatialEngineResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<SpatialEngine | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = Math.max(1, Math.round(container.clientWidth || canvas.clientWidth || 1));
    const height = Math.max(1, Math.round(container.clientHeight || canvas.clientHeight || 1));
    const eng = new SpatialEngine({ ...optionsRef.current, canvas, width, height });
    eng.start();
    setEngine(eng);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.max(1, Math.round(entry.contentRect.width));
        const h = Math.max(1, Math.round(entry.contentRect.height));
        eng.resize(w, h);
      });
      ro.observe(container);
    }

    return () => {
      ro?.disconnect();
      eng.dispose();
      setEngine(null);
    };
    // Intentionally mount-once: see the constructor-only-options note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { containerRef, canvasRef, engine };
}
