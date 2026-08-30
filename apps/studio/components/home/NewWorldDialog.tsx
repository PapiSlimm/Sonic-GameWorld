'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GENRES } from '@sonic-gameworld/world-schema';
import type { Genre } from '@sonic-gameworld/gameworld-sdk';
import { Button, Dialog, Input, Slider, useToast } from '@sonic-gameworld/ui';
import { ensureSession, getClient } from '../../lib/client';
import { createOfflineWorld } from '../../lib/offlineStore';
import { titleCase } from '../../lib/format';

export interface NewWorldDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewWorldDialog({ open, onClose }: NewWorldDialogProps) {
  const router = useRouter();
  const { push } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState<Genre>('CYBERPUNK');
  const [sizeKm2, setSizeKm2] = useState(4);
  const [maxPlayers, setMaxPlayers] = useState(32);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const online = await ensureSession();
      if (online) {
        try {
          const world = await getClient().worlds.create({ name: name.trim(), description, genre: [genre], sizeKm2, maxPlayers });
          onClose();
          router.push(`/worlds/${world.id}`);
          return;
        } catch {
          // fall through to offline
        }
      }
      const doc = createOfflineWorld({ name: name.trim(), description, genre: [genre], sizeKm2, maxPlayers });
      push({ title: 'Created offline demo world', tone: 'info' });
      onClose();
      router.push(`/worlds/${doc.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="New World" size="md">
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Neon Harbor District" autoFocus />
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-control border border-border bg-bg p-2.5 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="font-hud text-[11px] uppercase tracking-wider text-muted">Genre</span>
          <select value={genre} onChange={(e) => setGenre(e.target.value as Genre)} className="h-10 rounded-control border border-border bg-bg px-3 text-sm text-text">
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {titleCase(g)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Slider label="Size (km²)" value={sizeKm2} min={1} max={50} step={1} onChange={setSizeKm2} />
          <Slider label="Max players" value={maxPlayers} min={1} max={256} step={1} onChange={setMaxPlayers} />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!name.trim()} loading={creating} onClick={() => void create()}>
          Create World
        </Button>
      </div>
    </Dialog>
  );
}
