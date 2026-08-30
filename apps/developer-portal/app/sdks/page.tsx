'use client';
import Link from 'next/link';
import { ArrowRight, Blocks, Globe } from 'lucide-react';
import { Panel } from '@sonic-gameworld/ui';

const SDKS = [
  { href: '/sdks/web', label: 'Web SDK', icon: Globe, description: '@sonic-gameworld/gameworld-sdk — the typed fetch client used by every first-party app.', badge: 'TypeScript' },
  { href: '/sdks/unity', label: 'Unity SDK', icon: Blocks, description: 'GameWorldSDK for Unity — C# client, world loading, AI Director bridge.', badge: 'C#' },
  { href: '/sdks/unreal', label: 'Unreal Plugin', icon: Blocks, description: 'GameWorldPlugin for Unreal Engine — Blueprint nodes + C++ subsystem.', badge: 'C++ / Beta' },
];

export default function SdksIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text">SDKs</h1>
        <p className="text-sm text-muted">Official clients for building on Sonic GameWorld OS from Web, Unity or Unreal.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SDKS.map(({ href, label, icon: Icon, description, badge }) => (
          <Link key={href} href={href}>
            <Panel className="h-full transition-colors hover:border-accent/50" padded>
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-accent" aria-hidden />
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-text">
                {label}
                <span className="rounded-full border border-border px-2 py-0.5 font-hud text-[9px] uppercase tracking-wider text-muted">{badge}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{description}</div>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
