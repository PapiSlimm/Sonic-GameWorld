'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Command, Compass, LayoutGrid, Package } from 'lucide-react';
import { Kbd, cn } from '@sonic-gameworld/ui';

const NAV = [
  { href: '/', label: 'Projects', icon: LayoutGrid },
  { href: '/forge', label: 'WorldForge', icon: Compass },
  { href: '/kits', label: 'Game Kits', icon: Package },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-panel/90 px-5 backdrop-blur">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-control bg-accent/15 text-accent">
              <Compass className="h-4 w-4" />
            </span>
            <span className="font-hud text-sm font-semibold uppercase tracking-[0.2em] text-text">GameWorld Studio</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm transition-colors',
                    active ? 'bg-bg text-accent' : 'text-muted hover:text-text',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          className="flex items-center gap-2 rounded-control border border-border bg-bg px-3 py-1.5 text-xs text-muted hover:text-text"
        >
          <Command className="h-3.5 w-3.5" />
          Command palette
          <Kbd>⌘K</Kbd>
        </button>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
