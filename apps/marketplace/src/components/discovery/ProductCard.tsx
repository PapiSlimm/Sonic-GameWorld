import Link from 'next/link';
import { Star, Verified } from 'lucide-react';
import { Badge, PriceTag } from '@sonic-gameworld/ui';
import type { DemoProduct } from '../../lib/types.js';
import { CATEGORY_LABEL } from '../../lib/types.js';
import { formatCompactNumber } from '../../lib/format.js';
import { ProductThumb } from './ProductThumb.js';

export interface ProductCardProps {
  product: DemoProduct;
  className?: string;
}

/** Standard listing card used by /search, /category/[slug], /c/[handle] and the home page rails. */
export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      href={`/p/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-panel border border-border bg-panel transition-colors hover:border-accent/50"
    >
      <div className="aspect-[16/10] w-full">
        <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-center gap-1.5">
          <Badge tone="default">{CATEGORY_LABEL[product.category]}</Badge>
          {product.featured && <Badge tone="violet">Featured</Badge>}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold text-text group-hover:text-accent">{product.name}</h3>
        <p className="line-clamp-2 text-xs text-muted">{product.description}</p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-xs text-muted">
            <span className="truncate">{product.creator.displayName}</span>
            {product.creator.verified && <Verified className="h-3 w-3 shrink-0 text-accent" />}
          </div>
          {product.ratingCount > 0 && (
            <div className="flex shrink-0 items-center gap-1 font-hud text-[11px] text-warn">
              <Star className="h-3 w-3 fill-current" />
              {product.rating.toFixed(1)}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2.5">
          <PriceTag cents={product.priceCents} currency={product.currency} size="sm" />
          <span className="font-hud text-[10px] uppercase tracking-wider text-muted">{formatCompactNumber(product.sales)} sold</span>
        </div>
      </div>
    </Link>
  );
}

export function ProductCardGrid({ products, emptyMessage }: { products: DemoProduct[]; emptyMessage?: string }) {
  if (products.length === 0) {
    return <div className="rounded-panel border border-dashed border-border p-10 text-center text-sm text-muted">{emptyMessage ?? 'No products match yet.'}</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
