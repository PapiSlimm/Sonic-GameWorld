'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Box, Library, Package, Search, ShoppingCart } from 'lucide-react';
import { Badge, CommandPalette, Kbd, useCommandPalette, type CommandItem } from '@sonic-gameworld/ui';
import { CATEGORY_SLUGS } from '../../lib/data.js';
import { CATEGORY_LABEL } from '../../lib/types.js';
import { useMarketplaceStore } from '../../lib/cartStore.js';

const NAV_LINKS = [
  { href: '/', label: 'Discover' },
  { href: '/search', label: 'Search' },
  { href: '/library', label: 'Library' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const cartCount = useMarketplaceStore((s) => s.cart.length);
  const libraryCount = useMarketplaceStore((s) => s.library.length);

  const commandItems = useMemo<CommandItem[]>(() => {
    const categoryItems: CommandItem[] = Object.entries(CATEGORY_SLUGS).map(([category, slug]) => ({
      id: `cat-${slug}`,
      label: CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL],
      group: 'Categories',
      icon: <Package className="h-4 w-4" />,
      onSelect: () => router.push(`/category/${slug}`),
    }));
    return [
      { id: 'home', label: 'Discovery map', group: 'Navigate', icon: <Box className="h-4 w-4" />, onSelect: () => router.push('/') },
      { id: 'search', label: 'Search everything', group: 'Navigate', icon: <Search className="h-4 w-4" />, onSelect: () => router.push('/search') },
      { id: 'cart', label: 'View cart', group: 'Navigate', icon: <ShoppingCart className="h-4 w-4" />, onSelect: () => router.push('/cart') },
      { id: 'library', label: 'My library', group: 'Navigate', icon: <Library className="h-4 w-4" />, onSelect: () => router.push('/library') },
      ...categoryItems,
    ];
  }, [router]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-control border border-accent/40 bg-accent/10 font-hud text-accent">GW</span>
          <span className="font-hud text-sm uppercase tracking-[0.2em] text-text">
            GameWorld <span className="text-accent">Market</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-control px-3 py-1.5 font-hud text-[11px] uppercase tracking-wider transition-colors ${
                  active ? 'bg-panel text-accent' : 'text-muted hover:text-text'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto hidden flex-1 items-center gap-2 rounded-control border border-border bg-panel px-3 py-2 text-left text-sm text-muted hover:border-accent/50 sm:flex sm:max-w-xs"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1">Search the market…</span>
          <Kbd>⌘K</Kbd>
        </button>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search"
            className="rounded-control p-2 text-muted hover:bg-panel hover:text-text sm:hidden"
          >
            <Search className="h-5 w-5" />
          </button>
          <Link href="/library" aria-label="Library" className="relative rounded-control p-2 text-muted hover:bg-panel hover:text-text">
            <Library className="h-5 w-5" />
            {libraryCount > 0 && (
              <Badge tone="violet" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px]">
                {libraryCount}
              </Badge>
            )}
          </Link>
          <Link href="/cart" aria-label="Cart" className="relative rounded-control p-2 text-muted hover:bg-panel hover:text-text">
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <Badge tone="accent" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[9px]">
                {cartCount}
              </Badge>
            )}
          </Link>
        </div>
      </div>

      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        items={commandItems}
        placeholder="Search products, categories, creators…"
        onSubmitText={(text) => router.push(`/search?q=${encodeURIComponent(text)}`)}
        freeTextLabel="Search for"
      />
    </header>
  );
}
