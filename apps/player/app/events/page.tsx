'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Users, WifiOff } from 'lucide-react';
import { Badge, EmptyState, Panel, Tabs } from '@sonic-gameworld/ui';
import type { LiveEvent } from '@sonic-gameworld/gameworld-sdk';
import { getGameWorldClient, withDemoFallback } from '../../lib/sdk';
import { getDemoLiveEvents } from '../../lib/demo/data';
import { EventStatusBadge, formatCountdown, useCountdown } from '../../components/events/countdown';

function EventRow({ event }: { event: LiveEvent }) {
  const remaining = useCountdown(event.status === 'LIVE' ? event.endsAt : event.startsAt);
  return (
    <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <EventStatusBadge status={event.status} />
          <Badge>{event.type}</Badge>
        </div>
        <div className="text-base font-semibold text-text">{event.name}</div>
        {event.description && <p className="max-w-xl text-sm text-muted">{event.description}</p>}
        <div className="flex items-center gap-4 font-hud text-[11px] text-muted">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" aria-hidden /> {event.participants.toLocaleString()} participating</span>
          <span>{new Date(event.startsAt).toLocaleString()} → {new Date(event.endsAt).toLocaleString()}</span>
        </div>
      </div>
      <div className="flex flex-col items-start gap-1 sm:items-end">
        <span className="font-hud text-[10px] uppercase tracking-wider text-muted">
          {event.status === 'ENDED' ? 'Ended' : event.status === 'LIVE' ? 'Time remaining' : 'Starts in'}
        </span>
        <span className="font-hud text-xl font-semibold tabular-nums text-accent">
          {event.status === 'ENDED' ? '—' : formatCountdown(remaining)}
        </span>
        {event.gameId && (
          <a href={`/g/${event.gameId}`} className="font-hud text-[11px] uppercase tracking-wider text-accent2 hover:underline">
            Go to game →
          </a>
        )}
      </div>
    </Panel>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [tab, setTab] = useState<'LIVE' | 'SCHEDULED' | 'ENDED' | 'ALL'>('ALL');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = getGameWorldClient();
      const { data, online: ok } = await withDemoFallback(async () => (await client.cloud.listLiveEvents({ limit: 50 })).items, getDemoLiveEvents);
      if (cancelled) return;
      setEvents(data);
      setOnline(ok);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => (tab === 'ALL' ? events : events.filter((e) => e.status === tab)), [events, tab]);
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => new Date(a.status === 'ENDED' ? a.endsAt : a.startsAt).getTime() - new Date(b.status === 'ENDED' ? b.endsAt : b.startsAt).getTime()),
    [filtered],
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 font-hud text-xs uppercase tracking-[0.3em] text-accent">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Live Events
        </p>
        <h1 className="text-2xl font-semibold text-text">What&apos;s happening right now</h1>
        {!loading && !online && (
          <Badge tone="warn" dot className="w-fit">
            <WifiOff className="h-3 w-3" aria-hidden /> Offline demo mode — showing sample events
          </Badge>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <Tabs.List>
          <Tabs.Trigger value="ALL">All</Tabs.Trigger>
          <Tabs.Trigger value="LIVE">Live</Tabs.Trigger>
          <Tabs.Trigger value="SCHEDULED">Scheduled</Tabs.Trigger>
          <Tabs.Trigger value="ENDED">Ended</Tabs.Trigger>
        </Tabs.List>
      </Tabs>

      {loading ? (
        <div className="font-hud text-xs text-muted animate-gw-pulse">Loading live events…</div>
      ) : sorted.length === 0 ? (
        <EmptyState title="No events in this filter" description="Check back soon, or switch tabs to see scheduled and past events." />
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map((e) => <EventRow key={e.id} event={e} />)}
        </div>
      )}
    </main>
  );
}
