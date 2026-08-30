'use client';
import type { CreatorReputation } from '@sonic-gameworld/gameworld-sdk';

/** CONTRACTS §14: creatorScore sub-score weights, shown next to each bar. */
const SUB_SCORES: { key: keyof Omit<CreatorReputation, 'score' | 'computedAt'>; label: string; weight: number }[] = [
  { key: 'quality', label: 'Quality', weight: 0.2 },
  { key: 'reliability', label: 'Reliability', weight: 0.15 },
  { key: 'sales', label: 'Sales', weight: 0.15 },
  { key: 'updates', label: 'Updates', weight: 0.1 },
  { key: 'reviews', label: 'Reviews', weight: 0.15 },
  { key: 'support', label: 'Support', weight: 0.1 },
  { key: 'originality', label: 'Originality', weight: 0.1 },
  { key: 'compliance', label: 'Compliance', weight: 0.05 },
];

function barColor(v: number): string {
  if (v >= 75) return '#38F5C8';
  if (v >= 45) return '#FFB020';
  return '#FF4D6D';
}

export function ReputationBars({ reputation }: { reputation: CreatorReputation }) {
  return (
    <div className="flex flex-col gap-2.5">
      {SUB_SCORES.map(({ key, label, weight }) => {
        const value = Math.max(0, Math.min(100, reputation[key]));
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 font-hud text-[11px] uppercase tracking-wider text-muted">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${value}%`, background: barColor(value) }} />
            </div>
            <span className="w-9 shrink-0 text-right font-hud text-xs tabular-nums text-text/90">{Math.round(value)}</span>
            <span className="w-10 shrink-0 text-right font-hud text-[10px] tabular-nums text-muted" title="Weight in overall Creator Score">
              ×{weight.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
