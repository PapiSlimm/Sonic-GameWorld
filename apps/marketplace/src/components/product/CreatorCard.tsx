import Link from 'next/link';
import { Verified } from 'lucide-react';
import { Badge, Panel, ScoreRing } from '@sonic-gameworld/ui';
import type { CreatorPassport } from '@sonic-gameworld/gameworld-sdk';
import { formatCompactNumber } from '../../lib/format.js';

/** Creator card with `ScoreRing` (reputation, CONTRACTS §14) — shown on the product page and storefront header. */
export function CreatorCard({ passport }: { passport: CreatorPassport }) {
  const { profile, reputation, badges } = passport;
  return (
    <Panel title="Creator">
      <Link href={`/c/${profile.handle}`} className="flex items-center gap-4">
        <ScoreRing value={reputation.score} size={72} label="Score" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-text">{profile.displayName}</span>
            {profile.verified && <Verified className="h-3.5 w-3.5 shrink-0 text-accent" />}
          </div>
          <div className="text-xs text-muted">@{profile.handle}</div>
          <div className="mt-1 flex gap-3 text-xs text-muted">
            <span>{formatCompactNumber(profile.followers)} followers</span>
            <span>{profile.productCount} products</span>
          </div>
        </div>
      </Link>
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge} tone="violet">
              {badge.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      )}
    </Panel>
  );
}
