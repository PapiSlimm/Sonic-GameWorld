import type { AssetVariant } from '@sonic-gameworld/gameworld-sdk';

export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * Local copy of `@sonic-gameworld/ui`'s `formatCents` — see `./cn.ts` for why: that package bundles
 * client-only components into the same `dist/index.js`, so any plain function it exports can't be
 * *called* (as opposed to rendered) from a Server Component. `ProductSpecTable` needs this on the
 * server; client components are free to use either copy.
 */
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Deterministic variant ladder shown in `/library` — heaviest to lightest. */
export const VARIANT_LADDER: AssetVariant[] = ['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'MOBILE', 'WEB'];

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
