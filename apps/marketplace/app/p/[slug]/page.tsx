import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Verified } from 'lucide-react';
import { Badge } from '@sonic-gameworld/ui';
import { AssetPassportPanel } from '../../../src/components/product/AssetPassportPanel.js';
import { CompatibilityChecker } from '../../../src/components/product/CompatibilityChecker.js';
import { CreatorCard } from '../../../src/components/product/CreatorCard.js';
import { LicenseMatrix } from '../../../src/components/product/LicenseMatrix.js';
import { ProductActions } from '../../../src/components/product/ProductActions.js';
import { ProductPreviewStage } from '../../../src/components/product/ProductPreviewStage.js';
import { ProductSpecTable } from '../../../src/components/product/ProductSpecTable.js';
import { ReviewsList } from '../../../src/components/product/ReviewsList.js';
import { ProductCardGrid } from '../../../src/components/discovery/ProductCard.js';
import { CATEGORY_SLUGS, getCreatorPassport, getProductBySlug, getReviews, relatedProducts } from '../../../src/lib/data.js';
import { DEMO_PRODUCTS } from '../../../src/lib/demo.js';
import { CATEGORY_LABEL, GENRE_LABEL, ENGINE_LABEL } from '../../../src/lib/types.js';
import type { DemoProduct } from '../../../src/lib/types.js';

export function generateStaticParams() {
  return DEMO_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = (await getProductBySlug(slug)) as DemoProduct | undefined;
  if (!product) notFound();

  const [reviews, creatorPassport] = await Promise.all([getReviews(product.id), getCreatorPassport(product.creator.handle)]);
  const related = relatedProducts(product);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-8">
      <nav className="flex items-center gap-1.5 font-hud text-[10px] uppercase tracking-wider text-muted">
        <Link href="/" className="hover:text-accent">Market</Link>
        <span>/</span>
        <Link href={`/category/${CATEGORY_SLUGS[product.category]}`} className="hover:text-accent">
          {CATEGORY_LABEL[product.category]}
        </Link>
        <span>/</span>
        <span className="text-text/80">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <ProductPreviewStage product={product} />

          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{CATEGORY_LABEL[product.category]}</Badge>
              {product.genre.map((g) => (
                <Badge key={g}>{GENRE_LABEL[g]}</Badge>
              ))}
              {product.engines.map((e) => (
                <Badge key={e} tone="violet">{ENGINE_LABEL[e]}</Badge>
              ))}
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-text">{product.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              by <Link href={`/c/${product.creator.handle}`} className="text-accent hover:underline">{product.creator.displayName}</Link>
              {product.creator.verified && <Verified className="h-3.5 w-3.5 text-accent" />}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text/80">{product.longDescription ?? product.description}</p>
          </div>

          <CompatibilityChecker product={product} />
          <AssetPassportPanel passport={product.passport} />
          <ReviewsList reviews={reviews} rating={product.rating} ratingCount={product.ratingCount} />

          {related.length > 0 && (
            <div>
              <h2 className="mb-3 font-hud text-xs uppercase tracking-[0.2em] text-muted">Related listings</h2>
              <ProductCardGrid products={related} />
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-panel border border-border bg-panel p-4">
            <ProductActions product={product} />
          </div>
          <ProductSpecTable product={product} />
          <LicenseMatrix license={product.license} />
          {creatorPassport && <CreatorCard passport={creatorPassport} />}
        </aside>
      </div>
    </div>
  );
}
