'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Panel } from '@sonic-gameworld/ui';
import { buildDiscoveryTree, buildGlobeClusters } from '../../lib/spatialTree.js';
import { CATEGORY_LABEL, type DiscoveryCluster } from '../../lib/types.js';
import { CATEGORY_SLUGS } from '../../lib/data.js';
import type { DemoProduct } from '../../lib/types.js';
import { DiscoveryGlobeStage } from './DiscoveryGlobeStage.js';
import { DiscoveryPreviewCard } from './DiscoveryPreviewCard.js';
import { SpatialTreeNav } from './SpatialTreeNav.js';

export interface DiscoveryExperienceProps {
  products: DemoProduct[];
}

/**
 * The GameWorld Market home page: a spatial discovery surface, not a homepage feed. Three panels
 * share one selection state (cluster → genre → product), per CONTRACTS §12:
 *   left  = synchronized spatial tree  (WORLD → CITY → DISTRICT → BUILDING → ROOM → ASSET)
 *   center = DiscoveryGlobe (3D, falling back to the 2D radial graph)
 *   right = preview card for whatever is currently selected
 */
export function DiscoveryExperience({ products }: DiscoveryExperienceProps) {
  const [selectedCluster, setSelectedCluster] = useState<DiscoveryCluster | null>(null);
  const [selectedGenreKey, setSelectedGenreKey] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const clusters = useMemo(() => buildGlobeClusters(products), [products]);
  const root = useMemo(() => buildDiscoveryTree(products), [products]);
  const selectedProduct = useMemo(() => products.find((p) => p.id === selectedProductId), [products, selectedProductId]);

  const selectProduct = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      const cluster = clusters.find((c) => c.genres.some((g) => g.items.some((it) => it.productId === productId)));
      if (cluster) {
        setSelectedCluster(cluster.key);
        const genre = cluster.genres.find((g) => g.items.some((it) => it.productId === productId));
        if (genre) setSelectedGenreKey(genre.key);
      }
    }
  };

  const selectGenre = (genreKey: string | null) => {
    setSelectedGenreKey(genreKey);
    if (genreKey) setSelectedCluster(genreKey.split(':')[0] as DiscoveryCluster);
  };

  const selectCluster = (cluster: DiscoveryCluster | null) => {
    setSelectedCluster(cluster);
    if (!cluster) {
      setSelectedGenreKey(null);
      setSelectedProductId(null);
    } else {
      setSelectedGenreKey(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Spatial discovery</p>
        <h1 className="mt-1 text-3xl font-semibold text-text">GameWorld Market</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Worlds, games and assets, laid out like places instead of rows in a list. Fly the globe, walk the spatial tree, or
          jump straight to <Link href="/search" className="text-accent hover:underline">search</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        <Panel title="Spatial tree" className="order-2 lg:order-1" padded={false}>
          <div className="max-h-[560px] p-3">
            <SpatialTreeNav
              root={root}
              selectedCluster={selectedCluster}
              selectedGenreKey={selectedGenreKey}
              selectedProductId={selectedProductId}
              onSelectCluster={selectCluster}
              onSelectGenre={selectGenre}
              onSelectProduct={selectProduct}
            />
          </div>
        </Panel>

        <div className="order-1 lg:order-2">
          <DiscoveryGlobeStage
            products={products}
            clusters={clusters}
            selectedCluster={selectedCluster}
            selectedGenreKey={selectedGenreKey}
            selectedProductId={selectedProductId}
            onSelectCluster={selectCluster}
            onSelectGenre={selectGenre}
            onSelectProduct={selectProduct}
          />
        </div>

        <div className="order-3">
          <DiscoveryPreviewCard product={selectedProduct} />
        </div>
      </div>

      <Panel title="Browse by category">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_SLUGS).map(([category, slug]) => (
            <Link
              key={slug}
              href={`/category/${slug}`}
              className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs text-text/80 transition-colors hover:border-accent/50 hover:text-accent"
            >
              {CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL]}
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
