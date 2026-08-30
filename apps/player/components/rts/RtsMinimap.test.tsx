import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, RTS_FACTIONS } from '@sonic-gameworld/rts-sim';
import { seedStartingScenario } from '../../lib/rts/scenario';
import { RtsMinimap } from './RtsMinimap';

function makeMatch() {
  const factions = RTS_FACTIONS.map((f, i) => ({ factionId: f.id, isAIControlled: i !== 0 }));
  return seedStartingScenario(createMatch({ seed: 7, mapWidthM: 1000, mapDepthM: 1000, cellSizeM: 40, factions }));
}

describe('RtsMinimap', () => {
  it('renders a clickable canvas sized for the minimap, with no camera overlay when camera is null', () => {
    const html = renderToStaticMarkup(<RtsMinimap match={makeMatch()} camera={null} onJumpTo={() => {}} />);
    expect(html).toContain('<canvas');
    expect(html).toContain('width="200"');
    expect(html).toContain('height="200"');
    expect(html).toContain('RTS minimap');
  });

  it('renders without throwing when a camera viewport is supplied', () => {
    // The actual drawing happens in a useEffect (canvas 2D), which doesn't run during
    // server-side/static rendering — this asserts the component still mounts cleanly with the
    // extra prop rather than exercising the canvas drawing itself.
    expect(() =>
      renderToStaticMarkup(<RtsMinimap match={makeMatch()} camera={{ anchor: { x: 500, z: 500 }, distanceM: 150 }} onJumpTo={() => {}} />),
    ).not.toThrow();
  });
});
