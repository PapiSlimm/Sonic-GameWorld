import { describe, expect, it } from 'vitest';
import { compileManifest, variantCounts } from './manifest.js';
import { buildTestWorld } from './test/fixtures.js';

describe('compileManifest', () => {
  it('carries over world metadata and every entity', () => {
    const doc = buildTestWorld();
    const manifest = compileManifest(doc, 'WEB', new Date('2026-01-01T00:00:00.000Z'));
    expect(manifest.world.id).toBe(doc.id);
    expect(manifest.entities).toHaveLength(2);
    expect(manifest.generatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('resolves a variant for entities that carry an assetRef, and omits assetUrl for those that do not', () => {
    const doc = buildTestWorld();
    const manifest = compileManifest(doc, 'WEB');
    const spawn = manifest.entities.find((e) => e.name === 'Main Spawn')!;
    const prop = manifest.entities.find((e) => e.name === 'Neon Sign')!;
    expect(spawn.assetUrl).toBeUndefined();
    expect(prop.assetUrl).toEqual({ assetId: 'asset-neon-sign', versionId: 'version-1', variant: 'WEB' });
  });

  it('picks a different default variant per engine for the same entity', () => {
    const doc = buildTestWorld();
    const webManifest = compileManifest(doc, 'WEB');
    const unrealManifest = compileManifest(doc, 'UNREAL');
    const webProp = webManifest.entities.find((e) => e.name === 'Neon Sign')!;
    const unrealProp = unrealManifest.entities.find((e) => e.name === 'Neon Sign')!;
    expect(webProp.assetUrl?.variant).toBe('WEB');
    expect(unrealProp.assetUrl?.variant).toBe('ULTRA');
  });
});

describe('variantCounts', () => {
  it('tallies variants across entities', () => {
    const doc = buildTestWorld();
    const manifest = compileManifest(doc, 'WEB');
    expect(variantCounts(manifest)).toEqual({ WEB: 1 });
  });
});
