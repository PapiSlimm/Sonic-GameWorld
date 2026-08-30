'use client';

import type { Dispatch } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge, Input, Panel, Select, Toggle, type SelectOption } from '@sonic-gameworld/ui';
import { CATEGORY_LABEL, ENGINE_LABEL, GENRE_LABEL } from '../../lib/types.js';
import { activeFilterCount, type LicenseFlagFilters, type SearchAction, type SearchFilters, type SortOption } from '../../lib/searchFilters.js';

function toOptions<T extends string>(labels: Record<T, string>): SelectOption[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

const CATEGORY_OPTIONS = toOptions(CATEGORY_LABEL);
const GENRE_OPTIONS = toOptions(GENRE_LABEL);
const ENGINE_OPTIONS = toOptions(ENGINE_LABEL);
const SORT_OPTIONS: SelectOption[] = [
  { value: 'RELEVANCE', label: 'Relevance' },
  { value: 'NEWEST', label: 'Newest' },
  { value: 'TOP_RATED', label: 'Top rated' },
  { value: 'BEST_SELLING', label: 'Best selling' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
];

const LICENSE_FLAG_OPTIONS: { key: keyof LicenseFlagFilters; label: string }[] = [
  { key: 'commercial', label: 'Commercial use' },
  { key: 'multiplayer', label: 'Multiplayer' },
  { key: 'redistribution', label: 'Redistribution' },
  { key: 'modification', label: 'Modification' },
  { key: 'aiTraining', label: 'AI training' },
];

const CREATOR_SCORE_STEPS = [0, 50, 70, 85, 95];

export interface SearchFiltersPanelProps {
  filters: SearchFilters;
  dispatch: Dispatch<SearchAction>;
  resultCount: number;
}

/** Drives `/search` filters: category, genre, engine, price range, license flags, creator score, sort. */
export function SearchFiltersPanel({ filters, dispatch, resultCount }: SearchFiltersPanelProps) {
  const activeCount = activeFilterCount(filters);
  return (
    <Panel
      title="Filters"
      actions={
        activeCount > 0 ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET' })}
            className="inline-flex items-center gap-1 font-hud text-[10px] uppercase tracking-wider text-muted hover:text-accent"
          >
            <RotateCcw className="h-3 w-3" /> Reset ({activeCount})
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Search"
          placeholder="Search worlds, games, assets…"
          value={filters.q}
          onChange={(e) => dispatch({ type: 'SET_QUERY', q: e.target.value })}
        />

        <Select
          label="Category"
          placeholder="All categories"
          value={filters.category ?? ''}
          options={CATEGORY_OPTIONS}
          onChange={(e) => dispatch({ type: 'SET_CATEGORY', category: (e.target.value || undefined) as SearchFilters['category'] })}
        />
        <Select
          label="Genre"
          placeholder="All genres"
          value={filters.genre ?? ''}
          options={GENRE_OPTIONS}
          onChange={(e) => dispatch({ type: 'SET_GENRE', genre: (e.target.value || undefined) as SearchFilters['genre'] })}
        />
        <Select
          label="Engine"
          placeholder="All engines"
          value={filters.engine ?? ''}
          options={ENGINE_OPTIONS}
          onChange={(e) => dispatch({ type: 'SET_ENGINE', engine: (e.target.value || undefined) as SearchFilters['engine'] })}
        />

        <div className="flex flex-col gap-2">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Price</span>
          <Toggle checked={filters.free} onChange={(free) => dispatch({ type: 'SET_FREE', free })} label="Free only" size="sm" />
          {!filters.free && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="Min $"
                value={filters.minPriceCents !== undefined ? filters.minPriceCents / 100 : ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_PRICE_RANGE',
                    minPriceCents: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value) * 100)),
                    maxPriceCents: filters.maxPriceCents,
                  })
                }
                className="h-8 text-xs"
              />
              <span className="text-muted">–</span>
              <Input
                type="number"
                min={0}
                placeholder="Max $"
                value={filters.maxPriceCents !== undefined ? filters.maxPriceCents / 100 : ''}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_PRICE_RANGE',
                    minPriceCents: filters.minPriceCents,
                    maxPriceCents: e.target.value === '' ? undefined : Math.max(0, Math.round(Number(e.target.value) * 100)),
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">License</span>
          <div className="flex flex-wrap gap-1.5">
            {LICENSE_FLAG_OPTIONS.map(({ key, label }) => {
              const value = filters.licenseFlags[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => dispatch({ type: 'SET_LICENSE_FLAG', flag: key, value: value === true ? undefined : true })}
                  className="focus:outline-none"
                >
                  <Badge tone={value === true ? 'accent' : 'default'} className="cursor-pointer">
                    {label}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Min. creator score</span>
          <div className="flex flex-wrap gap-1.5">
            {CREATOR_SCORE_STEPS.map((step) => (
              <button key={step} type="button" onClick={() => dispatch({ type: 'SET_MIN_CREATOR_SCORE', value: filters.minCreatorScore === step ? undefined : step })}>
                <Badge tone={filters.minCreatorScore === step ? 'violet' : 'default'} className="cursor-pointer">
                  {step === 0 ? 'Any' : `${step}+`}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <Select
          label="Sort by"
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={(e) => dispatch({ type: 'SET_SORT', sort: e.target.value as SortOption })}
        />

        <div className="border-t border-border pt-3 font-hud text-[11px] uppercase tracking-wider text-muted">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </div>
      </div>
    </Panel>
  );
}
