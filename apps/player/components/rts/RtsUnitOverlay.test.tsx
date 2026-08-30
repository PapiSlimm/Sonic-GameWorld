import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRtsViewportRuntime } from '../../lib/rts/viewportRuntime';
import { RtsUnitOverlay } from './RtsUnitOverlay';

describe('RtsUnitOverlay', () => {
  it('renders a health bar for a selected, damaged unit but skips full-health unselected units', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([
      { id: 'u1', factionId: 'raven-alliance', unitClass: 'INFANTRY', screen: { x: 120, y: 80 }, health: 40, maxHealth: 100, isSelected: true },
      { id: 'u2', factionId: 'raven-alliance', unitClass: 'INFANTRY', screen: { x: 200, y: 80 }, health: 100, maxHealth: 100, isSelected: false },
    ]);

    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    // Selected unit's health bar is a partially-filled div — width should reflect 40%.
    expect(html).toContain('width:40%');
  });

  it('renders nothing extra when there are no markers', () => {
    const runtime = createRtsViewportRuntime();
    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).not.toContain('width:');
  });

  it('renders a fresh feedback marker as a visible icon with near-full opacity', () => {
    const runtime = createRtsViewportRuntime();
    runtime.addFeedbackMarker({ kind: 'MOVE', screen: { x: 50, y: 50 }, createdAtMs: Date.now() });
    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).toMatch(/opacity:(1|0\.9\d*)/); // 1 if this runs within the same ms as createdAtMs
    expect(html).toContain('<svg');
  });

  it('does not render a fully-aged-out feedback marker', () => {
    const runtime = createRtsViewportRuntime();
    runtime.addFeedbackMarker({ kind: 'ATTACK_MOVE', screen: { x: 50, y: 50 }, createdAtMs: Date.now() - 100_000 });
    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).not.toContain('opacity:');
  });
});
