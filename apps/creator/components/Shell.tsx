'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  BarChart3,
  Compass,
  Gauge,
  Package,
  Settings,
  Store,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@sonic-gameworld/ui';
import { useApi } from '../lib/api';

const NAV = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/payouts', label: 'Payouts', icon: Wallet },
  { href: '/storefront', label: 'Storefront', icon: Store },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, identity } = useApi();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel/60">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <Compass className="h-5 w-5 text-accent" aria-hidden />
          <div>
            <p className="font-hud text-[10px] uppercase tracking-[0.25em] text-muted">Sonic GameWorld</p>
            <p className="text-sm font-semibold text-text">Creator Passport</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname ?? '/', href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-bg text-accent shadow-glow' : 'text-text/75 hover:bg-bg hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            {status === 'live' ? <Wifi className="h-3.5 w-3.5 text-success" aria-hidden /> : <WifiOff className="h-3.5 w-3.5 text-warn" aria-hidden />}
            {status === 'connecting' ? 'Connecting…' : status === 'live' ? 'Live API' : 'Offline demo data'}
          </div>
        </div>
      </aside>
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-panel/40 px-6 py-3">
          <div>
            <p className="font-hud text-[10px] uppercase tracking-[0.25em] text-muted">Welcome back</p>
            <p className="text-sm font-medium text-text">{identity?.displayName ?? 'Nova Ando'}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={identity?.tier === 'STARTER' ? 'default' : 'accent'}>{identity?.tier ?? 'PRO'} plan</Badge>
            <Badge tone={status === 'live' ? 'success' : 'warn'} dot>
              {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Demo mode'}
            </Badge>
          </div>
        </header>
        <main className="flex-1 bg-grid bg-[length:32px_32px] bg-bg p-6">{children}</main>
      </div>
    </div>
  );
}
