// Real thumbnail rendering: a marketplace-grid PNG "card" showing the asset's name, category and
// poly count, built as an SVG (design tokens from CONTRACTS.md §12's dark "command-center"
// aesthetic) and rasterized with sharp. This is a genuine, deterministic rendering path — not a
// placeholder — used for every asset kind today; see renderer.ts for the GPU-based 3D-preview
// path this is deliberately factored to be replaceable by.
import sharp from 'sharp';

const TOKENS = {
  bg: '#05070B',
  panel: '#0B0F17',
  border: '#1B2230',
  accent: '#38F5C8',
  accent2: '#7C5CFF',
  text: '#E6EDF3',
  muted: '#8B96A8',
} as const;

const CATEGORY_ACCENT: Record<string, string> = {
  MODEL: TOKENS.accent,
  TEXTURE: TOKENS.accent2,
  MATERIAL: TOKENS.accent2,
  AUDIO: '#FFB020',
  VIDEO: '#FF4D6D',
  ANIMATION: TOKENS.accent,
  ARCHIVE: TOKENS.muted,
  IMAGE: TOKENS.accent2,
  OTHER: TOKENS.muted,
};

function escapeXml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** Formats a triangle count the way the studio/marketplace UIs do: "847 tris", "12.4K tris". */
export function formatPolyCount(polyCount: number | undefined): string | null {
  if (polyCount === undefined || polyCount === null || Number.isNaN(polyCount)) return null;
  if (polyCount < 1000) return `${polyCount} tris`;
  return `${(polyCount / 1000).toFixed(polyCount < 10_000 ? 1 : 0)}K tris`;
}

export interface RenderCardOptions {
  name: string;
  category: string;
  polyCount?: number;
  sizePx: number;
}

/** A deterministic hash-to-hue used only to give otherwise-identical asset cards a bit of visual
 * variety in the background glyph — purely cosmetic, never used for anything functional. */
function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export async function renderCardPng(opts: RenderCardOptions): Promise<Buffer> {
  const size = opts.sizePx;
  const accent = CATEGORY_ACCENT[opts.category.toUpperCase()] ?? TOKENS.accent;
  const hue = hashHue(opts.name || opts.category);
  const name = escapeXml(truncate(opts.name || 'Untitled Asset', 28));
  const category = escapeXml(opts.category.toUpperCase());
  const polyLabel = formatPolyCount(opts.polyCount);

  const pad = Math.round(size * 0.06);
  const badgeH = Math.round(size * 0.09);
  const fontTitle = Math.round(size * 0.065);
  const fontMeta = Math.round(size * 0.04);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${TOKENS.panel}" />
        <stop offset="100%" stop-color="${TOKENS.bg}" />
      </linearGradient>
      <radialGradient id="glyph" cx="70%" cy="25%" r="75%">
        <stop offset="0%" stop-color="hsl(${hue}, 85%, 55%)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="hsl(${hue}, 85%, 55%)" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#bg)" />
    <rect x="0" y="0" width="${size}" height="${size}" fill="url(#glyph)" />
    <rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="none" stroke="${TOKENS.border}" stroke-width="2" />
    <rect x="${pad}" y="${pad}" width="${Math.round(size * 0.28)}" height="${badgeH}" rx="${Math.round(badgeH / 2)}" fill="${TOKENS.bg}" stroke="${accent}" stroke-width="1.5" />
    <text x="${pad + Math.round(size * 0.14)}" y="${pad + badgeH / 2}" fill="${accent}" font-family="JetBrains Mono, monospace" font-size="${fontMeta}" font-weight="600" text-anchor="middle" dominant-baseline="central" letter-spacing="1">${category}</text>
    <g transform="translate(${size / 2}, ${size / 2 - size * 0.04})">
      <circle r="${Math.round(size * 0.16)}" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.5" />
      <circle r="${Math.round(size * 0.09)}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-opacity="0.35" />
    </g>
    <text x="${pad}" y="${size - pad - (polyLabel ? fontMeta * 1.8 : 0)}" fill="${TOKENS.text}" font-family="Inter, sans-serif" font-size="${fontTitle}" font-weight="600">${name}</text>
    ${polyLabel ? `<text x="${pad}" y="${size - pad}" fill="${TOKENS.muted}" font-family="JetBrains Mono, monospace" font-size="${fontMeta}">${escapeXml(polyLabel)}</text>` : ''}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
