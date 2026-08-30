import { describe, expect, it } from 'vitest';
import { compileEnginePackage } from './compile.js';
import { buildTestWorld } from './test/fixtures.js';

// Minimal local ZIP central-directory reader (no dependency on a full unzip library) — enough to
// assert "the expected file names are actually inside the archive" without pulling in yet another
// package just for a test.
function listZipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP (no EOCD found)');
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const CDFH_SIG = 0x02014b50;
  for (let i = 0; i < totalEntries; i++) {
    if (buffer.readUInt32LE(offset) !== CDFH_SIG) break;
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    names.push(name);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

describe('compileEnginePackage', () => {
  it('produces a valid non-empty ZIP for WEB with a manifest and an index.html', async () => {
    const doc = buildTestWorld();
    const pkg = await compileEnginePackage(doc, 'WEB');
    expect(pkg.buffer.byteLength).toBeGreaterThan(0);
    const names = listZipEntryNames(pkg.buffer);
    expect(names).toContain('manifest.json');
    expect(names).toContain('index.html');
  });

  it('produces a Unity package with manifest.json and a generated C# loader under Assets/GameWorld/<worldId>/', async () => {
    const doc = buildTestWorld();
    const pkg = await compileEnginePackage(doc, 'UNITY');
    const names = listZipEntryNames(pkg.buffer);
    expect(names).toContain(`Assets/GameWorld/${doc.id}/manifest.json`);
    expect(names).toContain(`Assets/GameWorld/${doc.id}/GameWorldLoader.cs`);
  });

  it('produces an Unreal package with manifest.json and generated C++ header + source', async () => {
    const doc = buildTestWorld();
    const pkg = await compileEnginePackage(doc, 'UNREAL');
    const names = listZipEntryNames(pkg.buffer);
    expect(names).toContain(`Content/GameWorld/${doc.id}/manifest.json`);
    expect(names).toContain('Source/GameWorldLoader.h');
    expect(names).toContain('Source/GameWorldLoader.cpp');
  });

  it('falls back to a manifest-only package for an engine with no dedicated loader generator (GODOT)', async () => {
    const doc = buildTestWorld();
    const pkg = await compileEnginePackage(doc, 'GODOT');
    const names = listZipEntryNames(pkg.buffer);
    expect(names).toEqual(['manifest.json']);
  });
});
