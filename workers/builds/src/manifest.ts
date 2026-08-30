// Compiles a validated WorldDocument into a compact, engine-specific build manifest: the JSON
// payload each runtime (the Web spatial-engine player, or a Unity/Unreal loader) actually reads at
// load time, with a resolved LOD variant per entity baked in so the runtime never has to make that
// decision itself.
import type { AssetVariant, EngineTarget, WorldDocument, WorldEntity } from '@sonic-gameworld/world-schema';
import { pickVariant } from './variant.js';

export interface ManifestEntity {
  id: string;
  kind: WorldEntity['kind'];
  name: string;
  parentId?: string;
  transform: WorldEntity['transform'];
  assetUrl?: { assetId: string; versionId?: string; variant: AssetVariant };
  behavior?: WorldEntity['behavior'];
  ai?: WorldEntity['ai'];
  tags: string[];
}

export interface EngineManifest {
  schemaVersion: string;
  engine: EngineTarget;
  world: { id: string; name: string; description: string; sizeKm2: number; maxPlayers: number };
  bounds: WorldDocument['bounds'];
  environment: WorldDocument['environment'];
  layers: WorldDocument['layers'];
  entities: ManifestEntity[];
  missions: WorldDocument['missions'];
  cameras: WorldDocument['cameras'];
  generatedAt: string;
}

function compileEntity(entity: WorldEntity, engine: EngineTarget): ManifestEntity {
  const out: ManifestEntity = {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    transform: entity.transform,
    tags: entity.tags,
  };
  if (entity.parentId) out.parentId = entity.parentId;
  if (entity.behavior) out.behavior = entity.behavior;
  if (entity.ai) out.ai = entity.ai;
  if (entity.assetRef) {
    out.assetUrl = { assetId: entity.assetRef.assetId, versionId: entity.assetRef.versionId, variant: pickVariant(engine, entity.assetRef.variant) };
  }
  return out;
}

export function compileManifest(doc: WorldDocument, engine: EngineTarget, now = new Date()): EngineManifest {
  return {
    schemaVersion: doc.schemaVersion,
    engine,
    world: { id: doc.id, name: doc.name, description: doc.description, sizeKm2: doc.sizeKm2, maxPlayers: doc.maxPlayers },
    bounds: doc.bounds,
    environment: doc.environment,
    layers: doc.layers,
    entities: doc.entities.map((e) => compileEntity(e, engine)),
    missions: doc.missions,
    cameras: doc.cameras,
    generatedAt: now.toISOString(),
  };
}

export function variantCounts(manifest: EngineManifest): Partial<Record<AssetVariant, number>> {
  const counts: Partial<Record<AssetVariant, number>> = {};
  for (const entity of manifest.entities) {
    if (!entity.assetUrl) continue;
    counts[entity.assetUrl.variant] = (counts[entity.assetUrl.variant] ?? 0) + 1;
  }
  return counts;
}
