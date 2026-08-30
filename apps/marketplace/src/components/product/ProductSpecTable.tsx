import { Panel } from '@sonic-gameworld/ui';
import type { DemoProduct } from '../../lib/types.js';
import { formatCents } from '../../lib/format.js';
import { CATEGORY_LABEL, GENRE_LABEL } from '../../lib/types.js';

interface SpecRow {
  label: string;
  value: string;
}

function buildRows(product: DemoProduct): SpecRow[] {
  const { spec } = product;
  const rows: SpecRow[] = [
    { label: 'Category', value: CATEGORY_LABEL[product.category] },
    { label: 'Genre', value: product.genre.map((g) => GENRE_LABEL[g]).join(' / ') || '—' },
  ];
  if (spec.worldSizeKm2 !== undefined) rows.push({ label: 'World size', value: `${spec.worldSizeKm2.toFixed(1)} km²` });
  if (spec.maxPlayers !== undefined) rows.push({ label: 'Max players', value: String(spec.maxPlayers) });
  if (spec.assetCount !== undefined) rows.push({ label: 'Assets', value: spec.assetCount.toLocaleString('en-US') });
  if (spec.missionCount !== undefined) rows.push({ label: 'Missions', value: String(spec.missionCount) });
  if (spec.npcCount !== undefined) rows.push({ label: 'NPCs', value: String(spec.npcCount) });
  if (spec.vehicleCount !== undefined) rows.push({ label: 'Vehicles', value: String(spec.vehicleCount) });
  rows.push({ label: 'Price', value: product.priceCents === 0 ? 'Free' : formatCents(product.priceCents, product.currency) });
  return rows;
}

/**
 * NEON TOKYO 2099-style spec table (CONTRACTS §12 design tokens): genre, world size, players, assets,
 * missions, NPCs, vehicles, price — a dense monospace readout in the marketplace's neon palette.
 */
export function ProductSpecTable({ product }: { product: DemoProduct }) {
  const rows = buildRows(product);
  return (
    <Panel title="Spec sheet" className="shadow-[0_0_24px_-8px_rgba(56,245,200,0.25)]" padded={false}>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
            <dt className="font-hud text-[10px] uppercase tracking-[0.18em] text-muted">{row.label}</dt>
            <dd className="font-hud text-sm font-semibold tabular-nums text-accent" style={{ textShadow: '0 0 12px rgba(56,245,200,0.35)' }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
