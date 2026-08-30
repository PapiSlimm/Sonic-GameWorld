import { describe, expect, it } from 'vitest';
import * as ReactBindings from './index.js';

/** Smoke test for the `./react` subpath's public surface (CONTRACTS §11): every documented export
 * exists and is the right kind of thing. Full render testing belongs to the consuming apps (studio,
 * marketplace) — this package's job is to guarantee the module loads and shapes up correctly. */
describe('spatial-engine react bindings module shape', () => {
  it('exports every component + hook documented in CONTRACTS §11', () => {
    expect(typeof ReactBindings.SpatialViewport).toBe('function');
    expect(typeof ReactBindings.useSpatialEngine).toBe('function');
    expect(typeof ReactBindings.HUD).toBe('function');
    expect(typeof ReactBindings.LayerPanel).toBe('function');
    expect(typeof ReactBindings.TrackingPanel).toBe('function');
    expect(typeof ReactBindings.CameraModeBar).toBe('function');
    expect(typeof ReactBindings.WorldControlBar).toBe('function');
    expect(typeof ReactBindings.DiscoveryGlobe).toBe('function');
    expect(typeof ReactBindings.useSpatialEngineContext).toBe('function');
  });

  it('re-exports the shared command-center design tokens', () => {
    expect(ReactBindings.TOKENS.bg).toBe('#05070B');
    expect(ReactBindings.TOKENS.accent).toBe('#38F5C8');
    expect(ReactBindings.TOKENS.accent2).toBe('#7C5CFF');
  });
});
