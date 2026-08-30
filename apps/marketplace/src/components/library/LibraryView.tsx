'use client';

import Link from 'next/link';
import { Download, ExternalLink, Library } from 'lucide-react';
import { Badge, EmptyState } from '@sonic-gameworld/ui';
import { useMarketplaceStore } from '../../lib/cartStore.js';
import { findProductById } from '../../lib/data.js';
import { formatDate, VARIANT_LADDER } from '../../lib/format.js';
import { ProductThumb } from '../discovery/ProductThumb.js';

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? 'http://localhost:3000';

export function LibraryView() {
  const library = useMarketplaceStore((s) => s.library);
  const entries = library
    .map((entry) => ({ entry, product: findProductById(entry.productId) }))
    .filter((e): e is { entry: (typeof library)[number]; product: NonNullable<ReturnType<typeof findProductById>> } => Boolean(e.product))
    .sort((a, b) => Date.parse(b.entry.acquiredAt) - Date.parse(a.entry.acquiredAt));

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Library className="h-8 w-8" />}
        title="Your library is empty"
        description="Anything you buy shows up here, with every download variant and a one-click hand-off into GameWorld Studio."
        action={<Link href="/search" className="text-sm text-accent hover:underline">Browse the market →</Link>}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {entries.map(({ entry, product }) => (
        <li key={entry.productId} className="flex flex-col gap-4 rounded-panel border border-border bg-panel p-4 sm:flex-row sm:items-center">
          <Link href={`/p/${product.slug}`} className="h-20 w-32 shrink-0 overflow-hidden rounded-control">
            <ProductThumb productId={product.id} category={product.category} thumbnailUrl={product.thumbnailUrl} className="h-full w-full" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/p/${product.slug}`} className="text-sm font-semibold text-text hover:text-accent">
              {product.name}
            </Link>
            <div className="mt-0.5 text-xs text-muted">{product.creator.displayName} · acquired {formatDate(entry.acquiredAt)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARIANT_LADDER.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  title={`Download ${variant} variant`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-1 font-hud text-[9px] uppercase tracking-wider text-muted transition-colors hover:border-accent/50 hover:text-accent"
                >
                  <Download className="h-2.5 w-2.5" />
                  {variant}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="success">Owned</Badge>
            <a
              href={`${STUDIO_URL}/?import=${product.refId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-control border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              Open in Studio
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
