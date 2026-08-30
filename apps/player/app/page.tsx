'use client';

import { WifiOff } from 'lucide-react';
import { Badge } from '@sonic-gameworld/ui';
import { Rail } from '../components/home/Rail';
import { CommunityCard, CreatorCard, GameCard, LiveEventRailCard, MissionCard, NpcCard, WorldCard } from '../components/home/cards';
import { useDiscoverData } from '../lib/hooks/useDiscoverData';

export default function HomePage() {
  const data = useDiscoverData();

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6">
      <section className="flex flex-col gap-2">
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Sonic GameWorld OS</p>
        <h1 className="text-3xl font-semibold text-text sm:text-4xl">GameWorld Play</h1>
        <p className="max-w-2xl text-sm text-text/70">
          Discover UGC worlds and games, drop into a session, and follow the loop from playing to remixing to publishing your own.
        </p>
        {!data.loading && !data.online && (
          <Badge tone="warn" dot className="w-fit">
            <WifiOff className="h-3 w-3" aria-hidden /> Offline demo mode — showing sample content
          </Badge>
        )}
      </section>

      <Rail title="Games" subtitle="Playable now" isEmpty={!data.loading && data.games.length === 0} emptyMessage="No games published yet.">
        {data.games.map((g) => <GameCard key={g.id} game={g} />)}
      </Rail>

      <Rail title="Worlds" subtitle="Remix-ready UGC worlds" isEmpty={!data.loading && data.worlds.length === 0} emptyMessage="No worlds published yet.">
        {data.worlds.map((w) => <WorldCard key={w.id} world={w} />)}
      </Rail>

      <Rail title="Live Events" subtitle="Happening across published games" isEmpty={!data.loading && data.liveEvents.length === 0} emptyMessage="No live events scheduled.">
        {data.liveEvents.map((e) => <LiveEventRailCard key={e.id} event={e} />)}
      </Rail>

      <Rail title="Missions" subtitle="Story and side content" isEmpty={!data.loading && data.missions.length === 0} emptyMessage="No missions available.">
        {data.missions.map((m) => <MissionCard key={m.id} mission={m} />)}
      </Rail>

      <Rail title="Creators" subtitle="Follow the builders behind these worlds" isEmpty={!data.loading && data.creators.length === 0} emptyMessage="No featured creators yet.">
        {data.creators.map((c) => <CreatorCard key={c.id} creator={c} />)}
      </Rail>

      <Rail title="AI Characters" subtitle="NPCs with memory, personality and quest logic" isEmpty={!data.loading && data.npcs.length === 0} emptyMessage="No AI characters yet.">
        {data.npcs.map((n) => <NpcCard key={n.id} npc={n} />)}
      </Rail>

      <Rail title="Communities" subtitle="Where players and creators hang out">
        {data.communities.map((c) => <CommunityCard key={c.id} community={c} />)}
      </Rail>
    </main>
  );
}
