'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bot, ExternalLink, Play, Sparkles, Users } from 'lucide-react';
import { Badge, Dialog, Panel } from '@sonic-gameworld/ui';
import type { CreatorProfile, Game, LiveEvent, Mission, NPC, World } from '@sonic-gameworld/gameworld-sdk';
import { MARKETPLACE_URL, STUDIO_URL } from '../../lib/sdk';
import type { CommunityLink } from '../../lib/demo/data';
import { EventStatusBadge, formatCountdown, useCountdown } from '../events/countdown';

const CARD = 'w-64 shrink-0';

export function GameCard({ game }: { game: Game }) {
  return (
    <Link href={`/g/${game.id}`} className={CARD}>
      <Panel padded={false} className="group h-full overflow-hidden transition-colors hover:border-accent/60">
        <div className="flex h-28 items-center justify-center bg-gradient-to-br from-accent2/20 to-bg font-hud text-4xl text-accent/40">
          <Play className="h-8 w-8 transition-transform group-hover:scale-110" aria-hidden />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="line-clamp-1 text-sm font-semibold text-text">{game.name}</div>
          <div className="flex flex-wrap gap-1">
            {game.genre.slice(0, 2).map((g) => (
              <Badge key={g} tone="accent">{g}</Badge>
            ))}
          </div>
          <div className="flex items-center justify-between font-hud text-[11px] text-muted">
            <span>{game.playerCount.toLocaleString()} players</span>
            <span>★ {game.rating.toFixed(1)}</span>
          </div>
        </div>
      </Panel>
    </Link>
  );
}

export function WorldCard({ world }: { world: World }) {
  return (
    <Panel padded={false} className={`${CARD} flex h-full flex-col overflow-hidden`}>
      <div className="flex h-24 items-center justify-center bg-gradient-to-br from-accent/15 to-bg font-hud text-xs uppercase tracking-widest text-muted">
        {world.sizeKm2} km²
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="line-clamp-1 text-sm font-semibold text-text">{world.name}</div>
        <p className="line-clamp-2 text-xs text-muted">{world.description}</p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="font-hud text-[10px] text-muted">{world.entityCount} entities</span>
          <a
            href={`${STUDIO_URL}/worlds/${world.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-hud text-[10px] uppercase tracking-wider text-accent2 hover:underline"
          >
            Remix in Studio <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>
    </Panel>
  );
}

export function MissionCard({ mission }: { mission: Mission }) {
  const [open, setOpen] = useState(false);
  const d = mission.definition;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${CARD} text-left`}>
        <Panel className="flex h-full flex-col gap-2 hover:border-accent/60">
          <div className="flex items-center justify-between">
            <Badge tone={d.state === 'ACTIVE' ? 'accent' : 'default'}>{d.state}</Badge>
            <span className="font-hud text-[10px] text-muted">Difficulty {d.difficulty}/10</span>
          </div>
          <div className="line-clamp-1 text-sm font-semibold text-text">{d.name}</div>
          <p className="line-clamp-3 text-xs text-muted">{d.description}</p>
          <div className="mt-auto font-hud text-[10px] text-muted">{d.objectives.length} objectives · {d.rewards.length} rewards</div>
        </Panel>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={d.name} description={`Difficulty ${d.difficulty}/10 · ${d.state}`} size="md">
        <p className="text-sm text-text/80">{d.description}</p>
        <ol className="mt-4 flex flex-col gap-2">
          {d.objectives.map((o, i) => (
            <li key={o.id} className="flex items-start gap-2 text-sm text-text/90">
              <span className="font-hud text-xs text-accent">{i + 1}.</span>
              <span>
                <span className="font-medium">{o.type}</span> — {o.description}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {d.rewards.map((r, i) => (
            <Badge key={i} tone="violet">{r.type}{r.amount ? ` +${r.amount}` : ''}{r.itemId ? `: ${r.itemId}` : ''}</Badge>
          ))}
        </div>
      </Dialog>
    </>
  );
}

export function CreatorCard({ creator }: { creator: CreatorProfile }) {
  return (
    <a href={`${MARKETPLACE_URL}/c/${creator.handle}`} target="_blank" rel="noreferrer" className={CARD}>
      <Panel className="flex h-full flex-col gap-2 hover:border-accent/60">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent2/20 font-hud text-sm text-accent2">
            {creator.displayName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate text-sm font-semibold text-text">
              {creator.displayName}
              {creator.verified && <Sparkles className="h-3 w-3 text-accent" aria-hidden />}
            </div>
            <div className="truncate font-hud text-[10px] text-muted">@{creator.handle}</div>
          </div>
        </div>
        <p className="line-clamp-2 text-xs text-muted">{creator.bio}</p>
        <div className="mt-auto flex items-center justify-between font-hud text-[10px] text-muted">
          <span>{creator.followers.toLocaleString()} followers</span>
          <span>{creator.productCount} products</span>
        </div>
      </Panel>
    </a>
  );
}

export function NpcCard({ npc }: { npc: NPC }) {
  const [open, setOpen] = useState(false);
  const p = npc.definition.personality;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${CARD} text-left`}>
        <Panel className="flex h-full flex-col gap-2 hover:border-accent/60">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent"><Bot className="h-4 w-4" aria-hidden /></div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text">{npc.name}</div>
              <div className="font-hud text-[10px] uppercase tracking-wider text-muted">{npc.definition.behavior.faction ?? 'unaffiliated'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {p.traits.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
          </div>
        </Panel>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={npc.name} description={p.tone} size="md">
        <p className="text-sm text-text/80">{p.backstory}</p>
        <div className="mt-3 flex flex-wrap gap-1">{p.traits.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>
        {npc.definition.dialogue.openingLines[0] && (
          <blockquote className="mt-4 rounded-control border border-border bg-bg p-3 text-sm italic text-text/80">
            “{npc.definition.dialogue.openingLines[0]}”
          </blockquote>
        )}
      </Dialog>
    </>
  );
}

export function CommunityCard({ community }: { community: CommunityLink }) {
  return (
    <a href={community.url} target="_blank" rel="noreferrer" className={CARD}>
      <Panel className="flex h-full flex-col gap-2 hover:border-accent/60">
        <div className="flex items-center gap-2 font-hud text-[10px] uppercase tracking-wider text-accent2">
          <Users className="h-3.5 w-3.5" aria-hidden /> {community.platform}
        </div>
        <div className="text-sm font-semibold text-text">{community.name}</div>
        <p className="line-clamp-2 text-xs text-muted">{community.description}</p>
        <div className="mt-auto font-hud text-[10px] text-muted">{community.members.toLocaleString()} members</div>
      </Panel>
    </a>
  );
}

export function LiveEventRailCard({ event }: { event: LiveEvent }) {
  const remaining = useCountdown(event.status === 'LIVE' ? event.endsAt : event.startsAt);
  return (
    <Link href="/events" className={CARD}>
      <Panel className="flex h-full flex-col gap-2 hover:border-accent/60">
        <div className="flex items-center justify-between">
          <EventStatusBadge status={event.status} />
          <span className="font-hud text-[10px] text-muted">{event.type}</span>
        </div>
        <div className="line-clamp-1 text-sm font-semibold text-text">{event.name}</div>
        <p className="line-clamp-2 text-xs text-muted">{event.description}</p>
        <div className="mt-auto font-hud text-[11px] text-accent">
          {event.status === 'ENDED' ? 'Ended' : `${event.status === 'LIVE' ? 'Ends in' : 'Starts in'} ${formatCountdown(remaining)}`}
        </div>
      </Panel>
    </Link>
  );
}
