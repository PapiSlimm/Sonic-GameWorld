import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { buildDiscoveryGraph, type BuildDiscoveryGraphOptions, type DiscoveryNode, type DiscoveryProduct } from '../discovery/buildDiscoveryGraph.js';
import { DiscoveryGlobeRenderer } from '../discovery/DiscoveryGlobeRenderer.js';

export interface DiscoveryGlobeProps {
  products: DiscoveryProduct[];
  radius?: BuildDiscoveryGraphOptions['radius'];
  className?: string;
  style?: CSSProperties;
  background?: string | number;
  /** Auto-rotates the globe when idle (paused while dragging). Default true. */
  autoRotate?: boolean;
  onHover?: (node: DiscoveryNode | null) => void;
  onSelect?: (node: DiscoveryNode) => void;
}

function ndcFromEvent(e: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    x: rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 2 - 1 : 0,
    y: rect.height > 0 ? -(((e.clientY - rect.top) / rect.height) * 2 - 1) : 0,
  };
}

/**
 * React wrapper for the marketplace discovery globe: `buildDiscoveryGraph(products)` laid out on a
 * sphere, rendered by `DiscoveryGlobeRenderer`, with drag-to-rotate and hover/click product picking.
 * SSR-safe the same way `<SpatialViewport>` is — mount via `next/dynamic({ ssr: false })`.
 */
export function DiscoveryGlobe({ products, radius, className, style, background, autoRotate = true, onHover, onSelect }: DiscoveryGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer, setRenderer] = useState<DiscoveryGlobeRenderer | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = Math.max(1, Math.round(container.clientWidth || 1));
    const height = Math.max(1, Math.round(container.clientHeight || 1));
    const r = new DiscoveryGlobeRenderer({ canvas, width, height, background });
    setRenderer(r);

    let raf = 0;
    let last = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const loop = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      r.tick(dt, autoRotate && !draggingRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        r.resize(Math.max(1, Math.round(entry.contentRect.width)), Math.max(1, Math.round(entry.contentRect.height)));
      });
      ro.observe(container);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      r.dispose();
      setRenderer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!renderer) return;
    renderer.setGraph(buildDiscoveryGraph(products, radius !== undefined ? { radius } : undefined));
  }, [renderer, products, radius]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current && lastPointerRef.current && renderer) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      renderer.rotateBy(dx * 0.006, dy * 0.006);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (renderer && onHover) onHover(renderer.hitTest(ndcFromEvent(e)));
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    lastPointerRef.current = null;
  };

  const handleClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!renderer || !onSelect) return;
    const node = renderer.hitTest(ndcFromEvent(e));
    if (node) onSelect(node);
  };

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleClick}
      />
    </div>
  );
}
