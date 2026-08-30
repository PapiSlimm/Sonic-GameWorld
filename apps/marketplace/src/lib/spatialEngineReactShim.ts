/**
 * Build-time stand-in for `@sonic-gameworld/spatial-engine/react` (see next.config.mjs).
 *
 * Only wired in via a webpack alias when that package's compiled `dist/react.js` isn't present
 * yet in this checkout. Deliberately exports nothing named `DiscoveryGlobe`/`SpatialViewport` —
 * `DiscoveryGlobeStage` treats a missing export as "the 3D engine isn't available" and renders the
 * 2D radial SVG fallback instead. Once spatial-engine ships the real file, next.config.mjs stops
 * aliasing to this shim automatically and the real component takes over with no code changes here.
 */
export {};
