// Turns a compiled EngineManifest into the actual on-disk (well — in-memory) package shape each
// target expects: a flat JSON manifest for the Web runtime, and Unity/Unreal export packages that
// pair the manifest with a generated loader-stub source file from src/templates/*.
import type { EngineTarget, WorldDocument } from '@sonic-gameworld/world-schema';
import { compileManifest, variantCounts, type EngineManifest } from './manifest.js';
import { renderUnityLoader } from './templates/unityLoader.js';
import { renderUnrealHeader, renderUnrealSource } from './templates/unrealLoader.js';
import { zipFiles } from './zip.js';

export interface CompiledPackage {
  manifest: EngineManifest;
  buffer: Buffer;
  /** e.g. 'zip' for every engine today; kept as a field rather than hardcoded so a future format
   * (e.g. an uncompressed folder upload) doesn't need a signature change. */
  format: 'zip';
}

async function compileWeb(doc: WorldDocument, now: Date): Promise<CompiledPackage> {
  const manifest = compileManifest(doc, 'WEB', now);
  const indexHtml = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${manifest.world.name} — GameWorld Play</title></head>
  <body>
    <div id="root"></div>
    <script type="module">
      // Bootstraps @sonic-gameworld/spatial-engine against this bundle's manifest.json.
      // This stub intentionally ships no bundler output — the real player app (apps/player)
      // imports the engine directly; this file documents the load contract for a standalone embed.
      fetch('./manifest.json').then((r) => r.json()).then((manifest) => {
        console.log('GameWorld manifest loaded:', manifest.world.name, manifest.entities.length, 'entities');
      });
    </script>
  </body>
</html>`;
  const buffer = await zipFiles([
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'index.html', content: indexHtml },
  ]);
  return { manifest, buffer, format: 'zip' };
}

async function compileUnity(doc: WorldDocument, now: Date): Promise<CompiledPackage> {
  const manifest = compileManifest(doc, 'UNITY', now);
  const loader = renderUnityLoader({ worldId: doc.id, worldName: doc.name, generatedAt: manifest.generatedAt, entityCount: manifest.entities.length });
  const base = `Assets/GameWorld/${doc.id}`;
  const buffer = await zipFiles([
    { name: `${base}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
    { name: `${base}/GameWorldLoader.cs`, content: loader },
  ]);
  return { manifest, buffer, format: 'zip' };
}

async function compileUnreal(doc: WorldDocument, now: Date): Promise<CompiledPackage> {
  const manifest = compileManifest(doc, 'UNREAL', now);
  const header = renderUnrealHeader({ worldId: doc.id, worldName: doc.name });
  const source = renderUnrealSource({ worldId: doc.id, worldName: doc.name, generatedAt: manifest.generatedAt, entityCount: manifest.entities.length });
  const buffer = await zipFiles([
    { name: `Content/GameWorld/${doc.id}/manifest.json`, content: JSON.stringify(manifest, null, 2) },
    { name: 'Source/GameWorldLoader.h', content: header },
    { name: 'Source/GameWorldLoader.cpp', content: source },
  ]);
  return { manifest, buffer, format: 'zip' };
}

/** Godot (and any future EngineTarget) gets an honest manifest-only package: no loader-stub
 * generator exists for it yet, so the export deliberately doesn't fabricate one. */
async function compileManifestOnly(doc: WorldDocument, engine: EngineTarget, now: Date): Promise<CompiledPackage> {
  const manifest = compileManifest(doc, engine, now);
  const buffer = await zipFiles([{ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) }]);
  return { manifest, buffer, format: 'zip' };
}

export async function compileEnginePackage(doc: WorldDocument, engine: EngineTarget, now = new Date()): Promise<CompiledPackage> {
  switch (engine) {
    case 'WEB':
      return compileWeb(doc, now);
    case 'UNITY':
      return compileUnity(doc, now);
    case 'UNREAL':
      return compileUnreal(doc, now);
    default:
      return compileManifestOnly(doc, engine, now);
  }
}

export { variantCounts };
export type { EngineManifest };
