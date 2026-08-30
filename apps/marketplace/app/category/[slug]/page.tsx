import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCardGrid } from '../../../src/components/discovery/ProductCard.js';
import { CATEGORY_SLUGS, categoryFromSlug, searchProducts } from '../../../src/lib/data.js';
import { cn } from '../../../src/lib/cn.js';
import { CATEGORY_LABEL } from '../../../src/lib/types.js';
import type { SortOption } from '../../../src/lib/searchFilters.js';

export function generateStaticParams() {
  return Object.values(CATEGORY_SLUGS).map((slug) => ({ slug }));
}

const SORT_LINKS: { value: SortOption; label: string }[] = [
  { value: 'RELEVANCE', label: 'Relevance' },
  { value: 'NEWEST', label: 'Newest' },
  { value: 'TOP_RATED', label: 'Top rated' },
  { value: 'BEST_SELLING', label: 'Best selling' },
  { value: 'PRICE_ASC', label: 'Price ↑' },
  { value: 'PRICE_DESC', label: 'Price ↓' },
];

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort: sortParam } = await searchParams;
  const category = categoryFromSlug(slug);
  if (!category) notFound();

  const sort = (SORT_LINKS.some((s) => s.value === sortParam) ? sortParam : 'BEST_SELLING') as SortOption;
  const { items: products, total } = await searchProducts({ category, sort, limit: 48 });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(CATEGORY_SLUGS).map(([cat, s]) => (
          <Link
            key={s}
            href={`/category/${s}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs transition-colors',
              s === slug ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border bg-panel text-text/70 hover:text-text',
            )}
          >
            {CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL]}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Category</p>
          <h1 className="mt-1 text-2xl font-semibold text-text">{CATEGORY_LABEL[category]}</h1>
          <p className="mt-1 text-sm text-muted">{total} listing{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {SORT_LINKS.map((s) => (
            <Link
              key={s.value}
              href={`/category/${slug}?sort=${s.value}`}
              className={cn(
                'rounded-control px-2.5 py-1 font-hud text-[10px] uppercase tracking-wider transition-colors',
                sort === s.value ? 'bg-panel text-accent' : 'text-muted hover:text-text',
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <ProductCardGrid products={products} emptyMessage="Nothing published in this category yet." />

      <Link href={`/search?category=${category}`} className="self-start text-sm text-accent hover:underline">
        Refine with full search filters →
      </Link>
    </div>
  );
}
