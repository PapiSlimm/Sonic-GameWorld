'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Loader2 } from 'lucide-react';
import { Button, Input, Panel, Select, Slider, useToast } from '@sonic-gameworld/ui';
import { ensureSession, getClient } from '../../lib/client';
import { forgeWorldLocally } from '../../lib/localForge';
import { saveOfflineDocument } from '../../lib/offlineStore';

const THEMES = [
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'modern', label: 'Modern City' },
  { value: 'post-apocalyptic', label: 'Post-Apocalyptic' },
  { value: 'historical', label: 'Historical' },
];

const PRESETS = [
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { label: 'London', lat: 51.5072, lon: -0.1276 },
];

export function ForgeForm() {
  const router = useRouter();
  const { push } = useToast();
  const [lat, setLat] = useState(35.6762);
  const [lon, setLon] = useState(139.6503);
  const [radiusKm, setRadiusKm] = useState(2);
  const [theme, setTheme] = useState('cyberpunk');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const online = await ensureSession();
      if (online) {
        try {
          const client = getClient();
          const world = await client.worlds.create({ name: name || `Forged World @ ${lat.toFixed(2)}, ${lon.toFixed(2)}`, sizeKm2: Math.max(1, Math.round(Math.PI * radiusKm * radiusKm)) });
          const result = await client.worlds.forge(world.id, { lat, lon, radiusKm, theme, name: name || undefined });
          push({ title: `Forged ${result.stats.buildings} buildings, ${result.stats.roads} roads`, tone: 'success' });
          router.push(`/worlds/${result.worldId}`);
          return;
        } catch {
          // fall through to offline forge
        }
      }
      const { document, stats } = forgeWorldLocally({ lat, lon, radiusKm, theme, name: name || undefined });
      saveOfflineDocument(document);
      push({ title: `Forged offline: ${stats.buildings} buildings, ${stats.roads} roads`, tone: 'info' });
      router.push(`/worlds/${document.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="WorldForge">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-muted">Anchor a new world to a real-world location and let WorldForge lay out terrain, buildings, and roads automatically.</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setLat(p.lat);
                setLon(p.lon);
              }}
              className="rounded-full border border-border bg-bg px-3 py-1 text-xs text-muted hover:border-accent/40 hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Latitude" type="number" step={0.0001} value={lat} onChange={(e) => setLat(Number(e.target.value))} />
          <Input label="Longitude" type="number" step={0.0001} value={lon} onChange={(e) => setLon(Number(e.target.value))} />
        </div>
        <Slider label="Radius (km)" value={radiusKm} min={0.5} max={10} step={0.5} onChange={setRadiusKm} />
        <Select label="Theme" value={theme} options={THEMES} onChange={(e) => setTheme(e.target.value)} />
        <Input label="World name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to auto-name" />
        <Button variant="primary" loading={busy} onClick={() => void generate()} leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}>
          Forge World
        </Button>
      </div>
    </Panel>
  );
}
