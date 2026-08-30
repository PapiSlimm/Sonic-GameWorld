'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, Gamepad2, Compass, GitFork, Hammer, Rocket, Coins, TrendingUp } from 'lucide-react';
import { Button, Panel, useToast } from '@sonic-gameworld/ui';
import { getGameWorldClient, STUDIO_URL } from '../../lib/sdk';
import { usePlayerStore } from '../../lib/store/playerStore';

const LOOP = [
  { key: 'PLAY', icon: Gamepad2, title: 'Play', description: 'Jump into UGC worlds and games built by other creators.' },
  { key: 'DISCOVER', icon: Compass, title: 'Discover', description: 'Find worlds, assets and characters worth remixing across GameWorld Market.' },
  { key: 'REMIX', icon: GitFork, title: 'Remix', description: 'Fork a world you love straight into GameWorld Studio, license permitting.' },
  { key: 'CREATE', icon: Hammer, title: 'Create', description: 'Build with the AI Director, spatial editor and asset pipeline.' },
  { key: 'PUBLISH', icon: Rocket, title: 'Publish', description: 'Ship your world or game as a product with a license and Asset Passport.' },
  { key: 'MONETIZE', icon: Coins, title: 'Monetize', description: '85/15 base revenue split on every sale, subscription, or licensed remix.' },
  { key: 'GROW', icon: TrendingUp, title: 'Grow', description: 'Build reputation, followers and a storefront as players discover your work.' },
] as const;

export default function BecomeACreatorPage() {
  const [busy, setBusy] = useState(false);
  const user = usePlayerStore((s) => s.user);
  const token = usePlayerStore((s) => s.token);
  const { push } = useToast();

  async function becomeCreator() {
    if (!token || !user) {
      push({ title: 'Sign in first', description: 'Create a player passport on the Profile page, then come back here.', tone: 'info' });
      return;
    }
    setBusy(true);
    try {
      const client = getGameWorldClient();
      // PATCH /v1/creators/me — per docs/CONTRACTS.md §9, calling this the first time for a user
      // is what api-creator upserts a CreatorProfile from (emitting CREATOR_ACTIVATED, per §7's
      // event list), which is what "upgrades" a player to a creator.
      await client.creators.updateMe({ displayName: user.displayName });
      push({ title: "You're a creator now", description: 'Head over to GameWorld Studio to start building.', tone: 'success' });
    } catch {
      push({ title: 'Could not confirm', description: 'services/api is unreachable right now — try again once it is running.', tone: 'warn' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <section className="flex flex-col gap-3">
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">The Creator Loop</p>
        <h1 className="text-3xl font-semibold text-text sm:text-4xl">From player to publisher</h1>
        <p className="max-w-2xl text-sm text-text/70">
          Sonic GameWorld OS is built so anyone who plays can become a creator. Every world you love can be remixed
          — modification-permitting license required — into something new, published, and monetized.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LOOP.map((step, i) => (
          <Panel key={step.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <step.icon className="h-5 w-5 text-accent" aria-hidden />
              <span className="font-hud text-[10px] text-muted">{i + 1}/{LOOP.length}</span>
            </div>
            <div className="font-hud text-xs uppercase tracking-[0.15em] text-accent">{step.title}</div>
            <p className="text-sm text-text/80">{step.description}</p>
            {i < LOOP.length - 1 && <ArrowRight className="ml-auto mt-auto h-3.5 w-3.5 text-muted" aria-hidden />}
          </Panel>
        ))}
      </section>

      <Panel glow className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-text">Ready to build?</div>
          <p className="text-sm text-muted">Activating your creator profile is instant and free — STARTER tier, 1 project, 20 assets, 20% platform fee.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={becomeCreator} loading={busy}>Become a Creator</Button>
          <a href={STUDIO_URL} target="_blank" rel="noreferrer">
            <Button variant="secondary" rightIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}>Open Studio</Button>
          </a>
        </div>
      </Panel>

      {!token && (
        <p className="text-xs text-muted">
          Don&apos;t have a passport yet? <Link href="/profile" className="text-accent hover:underline">Sign in on your Profile</Link> first.
        </p>
      )}
    </main>
  );
}
