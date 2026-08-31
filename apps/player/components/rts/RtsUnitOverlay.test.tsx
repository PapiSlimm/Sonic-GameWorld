import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HEAT_DETECTION_THRESHOLD } from '@sonic-gameworld/rts-sim';
import { createRtsViewportRuntime, type UnitScreenMarker } from '../../lib/rts/viewportRuntime';
import { RtsUnitOverlay } from './RtsUnitOverlay';

/** Fills in the fields every test below doesn't care about, so each test only spells out what's
 * actually under test — matches this file's existing terse marker literals otherwise. */
function marker(overrides: Partial<UnitScreenMarker> & Pick<UnitScreenMarker, 'id' | 'screen'>): UnitScreenMarker {
  return {
    factionId: 'raven-alliance',
    unitClass: 'INFANTRY',
    health: 100,
    maxHealth: 100,
    isSelected: false,
    heat: 0,
    isThermallyDetected: false,
    ...overrides,
  };
}

describe('RtsUnitOverlay', () => {
  it('renders a health bar for a selected, damaged unit but skips full-health unselected units', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([
      marker({ id: 'u1', screen: { x: 120, y: 80 }, health: 40, isSelected: true }),
      marker({ id: 'u2', screen: { x: 200, y: 80 }, health: 100 }),
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

  it('shows a heat gauge for a selected unit, reflecting its current heat level', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([marker({ id: 'u1', screen: { x: 50, y: 50 }, isSelected: true, heat: 0.6 })]);

    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    // 0.6 / 1.2 gauge ceiling = 50%.
    expect(html).toContain('width:50%');
  });

  it('does not show a heat gauge for an unselected, full-health unit', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([marker({ id: 'u1', screen: { x: 50, y: 50 }, heat: 0.9 })]);

    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).not.toContain('width:');
  });

  it('renders a "Detected" indicator for a thermally-exposed enemy unit, even at full health and unselected', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([
      marker({ id: 'enemy-1', factionId: 'united-dragon-nations', screen: { x: 300, y: 60 }, heat: HEAT_DETECTION_THRESHOLD, isThermallyDetected: true }),
    ]);

    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).toContain('Detected');
    expect(html).toContain('<svg'); // the Flame icon
  });

  it('does not render a "Detected" indicator for a unit that is not thermally exposed', () => {
    const runtime = createRtsViewportRuntime();
    runtime.setUnitMarkers([marker({ id: 'enemy-1', factionId: 'united-dragon-nations', screen: { x: 300, y: 60 } })]);

    const html = renderToStaticMarkup(<RtsUnitOverlay runtime={runtime} />);
    expect(html).not.toContain('Detected');
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
