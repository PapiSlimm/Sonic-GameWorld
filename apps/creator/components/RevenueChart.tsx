'use client';
import { useId, useMemo, useState } from 'react';
import { formatCents } from '@sonic-gameworld/ui';

export interface RevenuePoint {
  date: string;
  revenueCents: number;
}

export interface RevenueChartProps {
  points: RevenuePoint[];
  height?: number;
  className?: string;
}

/** A dependency-free SVG line chart for the overview's revenue trend (CONTRACTS §12: "no chart lib"). */
export function RevenueChart({ points, height = 180, className }: RevenueChartProps) {
  const gradientId = useId();
  const width = 640;
  const padding = { top: 12, right: 8, bottom: 20, left: 8 };
  const [hover, setHover] = useState<number | null>(null);

  const { linePath, areaPath, dots, maxValue } = useMemo(() => {
    if (points.length === 0) return { linePath: '', areaPath: '', dots: [] as { x: number; y: number }[], maxValue: 0 };
    const max = Math.max(...points.map((p) => p.revenueCents), 1);
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const step = points.length > 1 ? innerW / (points.length - 1) : 0;
    const coords = points.map((p, i) => ({
      x: padding.left + step * i,
      y: padding.top + innerH - (p.revenueCents / max) * innerH,
    }));
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area = first && last ? `${line} L ${last.x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} L ${first.x.toFixed(2)} ${(height - padding.bottom).toFixed(2)} Z` : '';
    return { linePath: line, areaPath: area, dots: coords, maxValue: max };
  }, [points, height]);

  const active = hover !== null ? points[hover] : undefined;
  const activeDot = hover !== null ? dots[hover] : undefined;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue over time"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38F5C8" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#38F5C8" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + (height - padding.top - padding.bottom) * f}
            y2={padding.top + (height - padding.top - padding.bottom) * f}
            stroke="#1B2230"
            strokeWidth={1}
          />
        ))}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />}
        {linePath && <path d={linePath} fill="none" stroke="#38F5C8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {dots.map((d, i) => (
          <rect
            key={points[i]?.date ?? i}
            x={d.x - 8}
            y={padding.top}
            width={16}
            height={height - padding.top - padding.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {activeDot && (
          <>
            <line x1={activeDot.x} x2={activeDot.x} y1={padding.top} y2={height - padding.bottom} stroke="#7C5CFF" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={activeDot.x} cy={activeDot.y} r={4} fill="#38F5C8" stroke="#05070B" strokeWidth={2} />
          </>
        )}
      </svg>
      <div className="mt-1 flex h-5 items-center justify-between font-hud text-[10px] text-muted">
        <span>{points[0]?.date ?? ''}</span>
        {active ? (
          <span className="text-accent">
            {active.date} · {formatCents(active.revenueCents)}
          </span>
        ) : (
          <span>peak {formatCents(maxValue)}</span>
        )}
        <span>{points[points.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  );
}
