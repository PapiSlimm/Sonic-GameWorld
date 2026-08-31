'use client';
import { Check, X } from 'lucide-react';
import { Badge, Button, cn } from '@sonic-gameworld/ui';
import { PLAN, PLAN_TIERS, isUnlimited, type PlanTier } from '@sonic-gameworld/world-schema';

function fmtLimit(n: number): string {
  return isUnlimited(n) ? 'Unlimited' : String(n);
}

export interface PlanTierTableProps {
  currentTier: PlanTier;
  onUpgrade?: (tier: PlanTier) => void;
  upgrading?: PlanTier | null;
}

/** CONTRACTS §4 — the 5-tier pricing table, exact numbers from the spec. */
export function PlanTierTable({ currentTier, onUpgrade, upgrading }: PlanTierTableProps) {
  const currentIdx = PLAN_TIERS.indexOf(currentTier);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Tier</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Price</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Platform fee</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Projects</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Assets</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted">Team</th>
            <th className="px-3 py-2 font-hud text-[10px] uppercase tracking-[0.18em] text-muted text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {PLAN_TIERS.map((tier) => {
            const def = PLAN[tier];
            const isCurrent = tier === currentTier;
            const idx = PLAN_TIERS.indexOf(tier);
            const isDowngrade = idx < currentIdx;
            const isTopTier = tier === 'STUDIO' || tier === 'ENTERPRISE';
            return (
              <tr key={tier} className={cn('border-b border-border/60 last:border-b-0 align-top', isCurrent && 'bg-accent/5')}>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text">{tier}</span>
                    {isCurrent && <Badge tone="accent">Current</Badge>}
                    {tier === 'ENTERPRISE' && <Badge tone="violet">Negotiated</Badge>}
                    {tier === 'STUDIO' && <Badge tone="accent">Most popular</Badge>}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {def.features.map((feature) => (
                      <li key={feature} className={cn('text-xs leading-snug text-muted', isTopTier && 'text-text/70')}>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-3 font-hud tabular-nums text-text/90">
                  {def.priceUsd === 0 ? 'Free' : `$${def.priceUsd}/mo`}
                </td>
                <td className="px-3 py-3 font-hud tabular-nums text-text/90">
                  {tier === 'ENTERPRISE' ? `${def.feePct}% (negotiable)` : `${def.feePct}%`}
                </td>
                <td className="px-3 py-3 text-text/80">{fmtLimit(def.projects)}</td>
                <td className="px-3 py-3 text-text/80">{fmtLimit(def.assets)}</td>
                <td className="px-3 py-3 text-text/80">{fmtLimit(def.teamMembers)}</td>
                <td className="px-3 py-3 text-right">
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1 text-xs text-success">
                      <Check className="h-3.5 w-3.5" /> Active
                    </span>
                  ) : isDowngrade ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <X className="h-3.5 w-3.5" /> Downgrade
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" loading={upgrading === tier} onClick={() => onUpgrade?.(tier)}>
                      {tier === 'ENTERPRISE' ? 'Contact sales' : 'Upgrade'}
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
