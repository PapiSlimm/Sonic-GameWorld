'use client';
import Link from 'next/link';
import { ArrowRight, Building2, Flag, Package, ShieldAlert, Users, Wallet, AlertTriangle, Activity } from 'lucide-react';
import { Panel, StatTile } from '@sonic-gameworld/ui';
import { DEMO_MODERATION_QUEUE } from '../lib/moderation.js';
import { DEMO_FRAUD_SIGNALS } from '../lib/fraud.js';
import { DEMO_PAYOUTS } from '../lib/payouts.js';
import { DEMO_PRODUCTS } from '../lib/products.js';

const SECTIONS = [
  { href: '/moderation', label: 'Moderation Queue', icon: ShieldAlert, description: 'Review flagged assets, products and worlds. Approve, reject or escalate.' },
  { href: '/fraud', label: 'Fraud Signals', icon: AlertTriangle, description: 'Payment risk, account takeover, refund abuse and engagement fraud.' },
  { href: '/users', label: 'Users', icon: Users, description: 'Search accounts, adjust roles and plan tiers.' },
  { href: '/orgs', label: 'Organizations', icon: Building2, description: 'Search orgs, manage members and tier overrides.' },
  { href: '/products', label: 'Products', icon: Package, description: 'Delist or feature marketplace listings.' },
  { href: '/payouts', label: 'Payouts', icon: Wallet, description: 'Approve or hold creator payout requests.' },
  { href: '/flags', label: 'Feature Flags', icon: Flag, description: 'Toggle rollout of platform features by environment.' },
  { href: '/observability', label: 'Observability', icon: Activity, description: 'System health tiles and business telemetry.' },
];

export default function OverviewPage() {
  const pendingModeration = DEMO_MODERATION_QUEUE.filter((m) => m.status === 'PENDING' || m.status === 'IN_REVIEW').length;
  const openFraud = DEMO_FRAUD_SIGNALS.filter((f) => f.status === 'OPEN' || f.status === 'REVIEWING').length;
  const pendingPayouts = DEMO_PAYOUTS.filter((p) => p.status === 'REQUESTED').length;
  const pendingProducts = DEMO_PRODUCTS.filter((p) => p.status === 'PENDING_REVIEW').length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Sonic GameWorld OS</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Admin Console</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Trust &amp; safety, fraud review, account management and platform operations for the Sonic GameWorld
          marketplace and ecosystem.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Moderation queue" value={pendingModeration} tone="danger" icon={<ShieldAlert className="h-4 w-4" />} />
        <StatTile label="Open fraud signals" value={openFraud} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatTile label="Payouts awaiting review" value={pendingPayouts} tone="accent" icon={<Wallet className="h-4 w-4" />} />
        <StatTile label="Products pending review" value={pendingProducts} tone="violet" icon={<Package className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition-colors hover:border-accent/50" padded>
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" aria-hidden />
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </div>
              <div className="mt-3 text-sm font-semibold text-text">{label}</div>
              <div className="mt-1 text-xs text-muted">{description}</div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
