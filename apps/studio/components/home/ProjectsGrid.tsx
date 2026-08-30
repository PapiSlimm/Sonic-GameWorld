'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { World } from '@sonic-gameworld/gameworld-sdk';
import { Badge, EmptyState } from '@sonic-gameworld/ui';
import { Loader2, Map as MapIcon, Users } from 'lucide-react';
import { ensureSession, getClient } from '../../lib/client';
import { listOfflineWorlds } from '../../lib/offlineStore';
import { relativeTime, titleCase } from '../../lib/format';

export function ProjectsGrid() {
  const router = useRouter();
  const [worlds, setWorlds] = useState<World[] | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const online = await ensureSession();
      if (cancelled) return;
      if (online) {
        try {
          const page = await getClient().worlds.list({ limit: 50 });
          if (!cancelled) {
            setWorlds(page.items);
            setOffline(false);
          }
          return;
        } catch {
          // fall through
        }
      }
      if (!cancelled) {
        setWorlds(listOfflineWorlds());
        setOffline(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (worlds === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (worlds.length === 0) {
    return (
      <div className="py-16">
        <EmptyState title="No worlds yet" description="Create your first world, forge one from a real place, or start from a Game Kit." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {offline && <p className="col-span-full text-xs text-warn">Showing offline demo projects — the API is unreachable.</p>}
      {worlds.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => router.push(`/worlds/${w.id}`)}
          className="group flex flex-col gap-3 rounded-panel border border-border bg-panel p-4 text-left transition-colors hover:border-accent/40"
        >
          <div className="flex aspect-video items-center justify-center rounded-control bg-grid bg-[length:24px_24px] bg-bg text-muted">
            <MapIcon className="h-8 w-8 opacity-40 transition-opacity group-hover:opacity-70" />
          </div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-text">{w.name}</h3>
            <Badge tone={w.status === 'PUBLISHED' ? 'success' : 'default'}>{w.status}</Badge>
          </div>
          <p className="line-clamp-2 text-xs text-muted">{w.description || 'No description yet.'}</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted">
            {w.genre.slice(0, 2).map((g) => (
              <Badge key={g} tone="default">
                {titleCase(g)}
              </Badge>
            ))}
            <span className="ml-auto flex items-center gap-1">
              <Users className="h-3 w-3" /> {w.maxPlayers}
            </span>
            <span>{w.entityCount} entities</span>
            <span>{relativeTime(w.updatedAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
