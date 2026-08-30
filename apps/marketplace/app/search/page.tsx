'use client';

import { Suspense, useEffect, useMemo, useReducer, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductCardGrid } from '../../src/components/discovery/ProductCard.js';
import { SearchFiltersPanel } from '../../src/components/search/SearchFiltersPanel.js';
import { DEMO_PRODUCTS } from '../../src/lib/demo.js';
import { applyProductFilters, INITIAL_SEARCH_FILTERS, searchReducer, type SearchFilters, type SortOption } from '../../src/lib/searchFilters.js';
import type { EngineTarget, Genre, ProductCategory } from '@sonic-gameworld/gameworld-sdk';

function filtersFromSearchParams(params: URLSearchParams): Partial<SearchFilters> {
  const licenseFlags: SearchFilters['licenseFlags'] = {};
  for (const key of ['commercial', 'multiplayer', 'redistribution', 'modification', 'aiTraining'] as const) {
    const raw = params.get(key);
    if (raw === 'true') licenseFlags[key] = true;
    else if (raw === 'false') licenseFlags[key] = false;
  }
  return {
    q: params.get('q') ?? '',
    category: (params.get('category') as ProductCategory | null) ?? undefined,
    genre: (params.get('genre') as Genre | null) ?? undefined,
    engine: (params.get('engine') as EngineTarget | null) ?? undefined,
    free: params.get('free') === 'true',
    minPriceCents: params.get('min') ? Number(params.get('min')) : undefined,
    maxPriceCents: params.get('max') ? Number(params.get('max')) : undefined,
    minCreatorScore: params.get('score') ? Number(params.get('score')) : undefined,
    sort: (params.get('sort') as SortOption | null) ?? 'RELEVANCE',
    licenseFlags,
  };
}

function searchParamsFromFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.genre) params.set('genre', filters.genre);
  if (filters.engine) params.set('engine', filters.engine);
  if (filters.free) params.set('free', 'true');
  if (!filters.free) {
    if (filters.minPriceCents !== undefined) params.set('min', String(filters.minPriceCents));
    if (filters.maxPriceCents !== undefined) params.set('max', String(filters.maxPriceCents));
  }
  if (filters.minCreatorScore !== undefined) params.set('score', String(filters.minCreatorScore));
  if (filters.sort !== 'RELEVANCE') params.set('sort', filters.sort);
  for (const [key, value] of Object.entries(filters.licenseFlags)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

/**
 * `/search` — every marketplace listing, filterable by category/genre/engine/price/license flags/
 * creator score, sorted by rank (CONTRACTS §14). Filtering runs entirely client-side against the demo
 * catalog (`applyProductFilters`, the same pure function unit-tested in `searchFilters.test.ts`) so the
 * results update instantly as filters change; the URL stays in sync for shareable/bookmarkable searches.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1440px] px-6 py-8 text-sm text-muted">Loading search…</div>}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = useMemo(() => ({ ...INITIAL_SEARCH_FILTERS, ...filtersFromSearchParams(searchParams) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [filters, dispatch] = useReducer(searchReducer, initial);

  const skipNextUrlSync = useRef(true);
  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const qs = searchParamsFromFilters(filters);
    router.replace(qs ? `/search?${qs}` : '/search', { scroll: false });
  }, [filters, router]);

  const results = useMemo(() => applyProductFilters(DEMO_PRODUCTS, filters), [filters]);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Search</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Every world, game and asset</h1>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          <SearchFiltersPanel filters={filters} dispatch={dispatch} resultCount={results.length} />
        </aside>
        <section>
          <ProductCardGrid products={results} emptyMessage="No products match these filters — try widening your search." />
        </section>
      </div>
    </div>
  );
}
