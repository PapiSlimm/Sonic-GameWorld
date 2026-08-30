import { notFound } from 'next/navigation';
import { Verified } from 'lucide-react';
import { Badge, ScoreRing, StatTile } from '@sonic-gameworld/ui';
import { ProductCardGrid } from '../../../src/components/discovery/ProductCard.js';
import { getCreatorPassport, productsByCreator } from '../../../src/lib/data.js';
import { DEMO_CREATORS } from '../../../src/lib/demo.js';
import { formatCompactNumber } from '../../../src/lib/format.js';

export function generateStaticParams() {
  return DEMO_CREATORS.map((c) => ({ handle: c.handle }));
}

export default async function CreatorStorefrontPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const passport = await getCreatorPassport(handle);
  if (!passport) notFound();

  const { profile, reputation, badges, stats } = passport;
  const products = productsByCreator(profile.id);

  return (
    <div className="flex flex-col">
      <div className="border-b border-border bg-[radial-gradient(circle_at_20%_-10%,rgba(124,92,255,0.12),transparent_60%)]">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center">
          <ScoreRing value={reputation.score} size={112} label="Reputation" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-text">{profile.displayName}</h1>
              {profile.verified && <Verified className="h-5 w-5 text-accent" />}
            </div>
            <p className="text-sm text-muted">@{profile.handle}</p>
            {profile.bio && <p className="mt-2 max-w-2xl text-sm text-text/80">{profile.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {badges.map((badge) => (
                <Badge key={badge} tone="violet">{badge.replace(/_/g, ' ')}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Followers" value={formatCompactNumber(profile.followers)} />
          <StatTile label="Products" value={profile.productCount} />
          <StatTile label="Total sales" value={formatCompactNumber(stats.totalSales)} tone="accent" />
          <StatTile label="Avg. rating" value={stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—'} tone="warn" />
        </div>

        <div>
          <h2 className="mb-3 font-hud text-xs uppercase tracking-[0.2em] text-muted">Storefront ({products.length})</h2>
          <ProductCardGrid products={products} emptyMessage="This creator hasn't published anything yet." />
        </div>
      </div>
    </div>
  );
}
