import Link from 'next/link';
import { ArrowRight, Radar, Star, Verified } from 'lucide-react';
import { Badge, EmptyState, PriceTag } from '@sonic-gameworld/ui';
import type { DemoProduct } from '../../lib/types.js';
import { CATEGORY_LABEL, GENRE_LABEL } from '../../lib/types.js';
import { ProductThumb } from './ProductThumb.js';

export interface DiscoveryPreviewCardProps {
  product: DemoProduct | undefined;
}

/**
 * Right-hand preview card, synchronized with whatever asset is currently selected on the globe/canvas
 * or the left spatial tree — CONTRACTS §12: "right = preview card".
 */
export function DiscoveryPreviewCard({ product }: DiscoveryPreviewCardProps) {
  if (!product) {
    return (
      <EmptyState
        icon={<Radar className="h-8 w-8" />}
        title="Select a world, game or asset"
        description="Click through the globe or the spatial tree on the left — clusters, then genres, then a listing — to preview it here."
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-panel border border-border bg-panel">
      <div className="aspect-[16/10] w-full">
        <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" iconClassName="h-10 w-10" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{CATEGORY_LABEL[product.category]}</Badge>
          {product.genre.slice(0, 2).map((g) => (
            <Badge key={g}>{GENRE_LABEL[g]}</Badge>
          ))}
        </div>
        <h3 className="text-base font-semibold leading-snug text-text">{product.name}</h3>
        <p className="line-clamp-3 text-xs text-muted">{product.description}</p>

        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            {product.creator.displayName}
            {product.creator.verified && <Verified className="h-3 w-3 text-accent" />}
          </span>
          {product.ratingCount > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 font-hud text-warn">
              <Star className="h-3 w-3 fill-current" />
              {product.rating.toFixed(1)}
              <span className="text-muted">({product.ratingCount})</span>
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          <PriceTag cents={product.priceCents} currency={product.currency} />
          <Link
            href={`/p/${product.slug}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-control bg-accent px-3 text-xs font-semibold text-bg shadow-glow transition-colors hover:bg-accent/90"
          >
            View
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
