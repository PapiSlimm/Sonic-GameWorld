'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@sonic-gameworld/ui';
import { Loader2, Package, Rocket } from 'lucide-react';
import { GAME_KITS, instantiateKitLocally, type GameKit } from '../../lib/kits';
import { ensureSession, getClient } from '../../lib/client';
import { saveOfflineDocument } from '../../lib/offlineStore';
import { titleCase } from '../../lib/format';

export function KitsGallery() {
  const router = useRouter();
  const [startingId, setStartingId] = useState<string | null>(null);

  const start = async (kit: GameKit) => {
    setStartingId(kit.id);
    try {
      const online = await ensureSession();
      if (online) {
        try {
          const world = await getClient().worlds.create({
            name: kit.name,
            description: kit.description,
            genre: kit.genre,
            sizeKm2: kit.sizeKm2,
            maxPlayers: kit.maxPlayers,
            template: kit.id,
          });
          router.push(`/worlds/${world.id}`);
          return;
        } catch {
          // fall through to offline
        }
      }
      const doc = instantiateKitLocally(kit);
      saveOfflineDocument(doc);
      router.push(`/worlds/${doc.id}`);
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {GAME_KITS.map((kit) => (
        <div key={kit.id} className="flex flex-col gap-3 rounded-panel border border-border bg-panel p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-accent2/15 text-accent2">
              <Package className="h-4 w-4" />
            </span>
            <h3 className="flex-1 text-sm font-semibold text-text">{kit.name}</h3>
          </div>
          <p className="flex-1 text-xs text-muted">{kit.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {kit.genre.map((g) => (
              <Badge key={g} tone="default">
                {titleCase(g)}
              </Badge>
            ))}
            {kit.tags.map((t) => (
              <Badge key={t} tone="violet">
                {t}
              </Badge>
            ))}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>{kit.sizeKm2} km²</span>
            <span>{kit.maxPlayers} players</span>
          </div>
          <Button
            variant="secondary"
            onClick={() => void start(kit)}
            loading={startingId === kit.id}
            leftIcon={startingId === kit.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          >
            Start from kit
          </Button>
        </div>
      ))}
    </div>
  );
}
