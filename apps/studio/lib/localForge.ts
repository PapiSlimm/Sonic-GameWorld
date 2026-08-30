import { createEmptyWorld, randomUuid, transformAt, SAMPLE_OWNER_ID, type WorldDocument, type WorldEntity } from '@sonic-gameworld/world-schema';

export interface LocalForgeInput {
  lat: number;
  lon: number;
  radiusKm: number;
  theme?: string;
  name?: string;
}

export interface LocalForgeResult {
  document: WorldDocument;
  stats: { buildings: number; roads: number; water: number; regions: number };
}

/**
 * Offline stand-in for `POST /v1/worlds/:id/forge` (CONTRACTS §9 WorldForge) — procedurally lays
 * out a small district around the given coordinates so GameWorld Studio's WorldForge page still
 * produces something explorable without a live geocoding/tiles backend.
 */
export function forgeWorldLocally(input: LocalForgeInput): LocalForgeResult {
  const halfExtentM = Math.min(20000, Math.max(200, input.radiusKm * 1000));
  const doc = createEmptyWorld({
    id: randomUuid(),
    ownerId: SAMPLE_OWNER_ID,
    name: input.name ?? `Forged World @ ${input.lat.toFixed(3)}, ${input.lon.toFixed(3)}`,
    description: `Procedurally forged from real-world coordinates (${input.lat.toFixed(4)}, ${input.lon.toFixed(4)}), radius ${input.radiusKm}km, theme "${input.theme ?? 'default'}".`,
    genre: ['OPEN_WORLD'],
    sizeKm2: Math.max(1, Math.round(Math.PI * input.radiusKm * input.radiusKm)),
    maxPlayers: 64,
    halfExtentM,
  });

  const region: WorldEntity = {
    id: randomUuid(),
    kind: 'REGION',
    name: `${input.theme ? `${input.theme[0]!.toUpperCase()}${input.theme.slice(1)} ` : ''}District`,
    transform: transformAt(0, 0, 0, 1),
    geo: { lat: input.lat, lon: input.lon, altM: 0 },
    tags: ['forged'],
    permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
    metadata: { theme: input.theme ?? 'default' },
  };

  const buildingCount = Math.max(3, Math.min(24, Math.round(input.radiusKm * 4)));
  const roadCount = Math.max(2, Math.min(10, Math.round(input.radiusKm * 1.5)));
  const waterCount = input.radiusKm > 1.5 ? 1 : 0;

  const buildings: WorldEntity[] = Array.from({ length: buildingCount }, (_, i) => {
    const angle = (i / buildingCount) * Math.PI * 2;
    const r = halfExtentM * 0.5 * (0.4 + 0.6 * Math.random());
    return {
      id: randomUuid(),
      kind: 'BUILDING',
      name: `Forged Building ${i + 1}`,
      parentId: region.id,
      transform: transformAt(Math.cos(angle) * r, 0, Math.sin(angle) * r, 1 + Math.random() * 3),
      tags: ['forged'],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
      metadata: {},
    } satisfies WorldEntity;
  });

  const roads: WorldEntity[] = Array.from({ length: roadCount }, (_, i) => ({
    id: randomUuid(),
    kind: 'ROAD',
    name: `Forged Road ${i + 1}`,
    parentId: region.id,
    transform: transformAt(0, 0, 0, halfExtentM * 0.8),
    tags: ['forged'],
    permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
    metadata: { index: i },
  }));

  const water: WorldEntity[] = Array.from({ length: waterCount }, (_, i) => ({
    id: randomUuid(),
    kind: 'WATER',
    name: `Forged Waterway ${i + 1}`,
    parentId: region.id,
    transform: transformAt(halfExtentM * 0.3, -1, 0, halfExtentM * 0.4),
    tags: ['forged'],
    permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
    metadata: {},
  }));

  const spawn: WorldEntity = {
    id: randomUuid(),
    kind: 'PLAYER_SPAWN',
    name: 'Forge Spawn',
    parentId: region.id,
    transform: transformAt(0, 0, 0, 1),
    tags: ['forged'],
    permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
    metadata: {},
  };

  return {
    document: {
      ...doc,
      origin: { lat: input.lat, lon: input.lon, altM: 0 },
      entities: [...doc.entities, region, ...buildings, ...roads, ...water, spawn],
    },
    stats: { buildings: buildings.length, roads: roads.length, water: water.length, regions: 1 },
  };
}
