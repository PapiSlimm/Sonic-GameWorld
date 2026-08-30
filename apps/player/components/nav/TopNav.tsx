'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gamepad2, Sparkles, User2, CalendarClock } from 'lucide-react';
import { cn } from '@sonic-gameworld/ui';

const LINKS = [
  { href: '/', label: 'Discover', icon: Gamepad2 },
  { href: '/events', label: 'Live Events', icon: CalendarClock },
  { href: '/profile', label: 'Profile', icon: User2 },
  { href: '/become-a-creator', label: 'Become a Creator', icon: Sparkles },
] as const;

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-hud text-[11px] uppercase tracking-[0.3em] text-accent">Sonic GameWorld OS</span>
          <span className="hidden text-sm font-semibold text-text sm:inline">GameWorld Play</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-control px-3 py-1.5 font-hud text-[11px] uppercase tracking-wider transition-colors',
                  active ? 'bg-panel text-accent shadow-glow' : 'text-muted hover:text-text',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
