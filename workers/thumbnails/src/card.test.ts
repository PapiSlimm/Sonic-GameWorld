import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { formatPolyCount, renderCardPng } from './card.js';

describe('renderCardPng', () => {
  it('renders a valid square PNG at the requested size', async () => {
    const png = await renderCardPng({ name: 'Cyber Katana', category: 'MODEL', polyCount: 12450, sizePx: 256 });
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it('handles missing poly count without throwing', async () => {
    const png = await renderCardPng({ name: 'Ambient Loop', category: 'AUDIO', sizePx: 128 });
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
  });

  it('escapes XML-unsafe characters in the name/category so the SVG stays well-formed', async () => {
    await expect(renderCardPng({ name: '<script>&"alert"</script>', category: 'MODEL', sizePx: 64 })).resolves.toBeInstanceOf(Buffer);
  });

  it('produces different bytes for different inputs (not a static fallback image)', async () => {
    const a = await renderCardPng({ name: 'Alpha Drone', category: 'VEHICLE', polyCount: 500, sizePx: 128 });
    const b = await renderCardPng({ name: 'Beta Tower', category: 'BUILDING', polyCount: 50000, sizePx: 128 });
    expect(Buffer.compare(a, b)).not.toBe(0);
  });
});

describe('formatPolyCount', () => {
  it('returns null when undefined', () => {
    expect(formatPolyCount(undefined)).toBeNull();
  });
  it('formats small counts as raw tris', () => {
    expect(formatPolyCount(847)).toBe('847 tris');
  });
  it('formats large counts in K with one decimal under 10K', () => {
    expect(formatPolyCount(4200)).toBe('4.2K tris');
  });
  it('formats very large counts in K with no decimal', () => {
    expect(formatPolyCount(124500)).toBe('125K tris');
  });
});
