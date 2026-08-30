// WorldForge (§9 of CONTRACTS.md: `POST /worlds/:id/forge {lat, lon, radiusKm, theme}`).
//
// A `WorldForgeProvider` turns a real-world coordinate + radius into a batch of forged entities
// (terrain, roads, buildings, water) with `GeoAnchor`s and source/licensing metadata:
//  - `OverpassProvider` — real fetch to the OSM Overpass API (buildings/roads/water) + a batched
//    elevation lookup against open-elevation.com. Tags every generated entity with
//    `source: 'OSM_OVERPASS'` and an ODbL-1.0 attribution note (OpenStreetMap's license).
//  - `SyntheticProvider` — a deterministic procedural city generator seeded from lat/lon/radius
//    (no network, no license concerns) — the default, and what tests exercise.
// `applyForgeTheme` post-processes the generated entities + environment for one of the four
// spec themes (POST_APOCALYPTIC / CYBERPUNK / ZOMBIE_OUTBREAK / FUTURE_FLOOD).
import { identityTransform, transformAt, type EntityKind, type WorldEntity, type WorldEnvironment } from '@sonic-gameworld/world-schema';

export type ForgeProviderName = 'OVERPASS' | 'SYNTHETIC';
export type ForgeTheme = 'POST_APOCALYPTIC' | 'CYBERPUNK' | 'ZOMBIE_OUTBREAK' | 'FUTURE_FLOOD';
export const FORGE_THEMES: ForgeTheme[] = ['POST_APOCALYPTIC', 'CYBERPUNK', 'ZOMBIE_OUTBREAK', 'FUTURE_FLOOD'];

export interface ForgeRequest {
  lat: number;
  lon: number;
  /** Generation radius in kilometers. */
  radiusKm: number;
}

/** A generated entity, pre-id/pre-permissions — the caller (forgeWorld) assigns a fresh uuid and
 * ownership before it's spliced into a WorldDocument. */
export type ForgedEntity = Omit<WorldEntity, 'id' | 'permissions'> & { id?: string };

export interface ForgeLicenseInfo {
  spdx?: string;
  label: string;
  attribution?: string;
}

export interface ForgeResult {
  entities: ForgedEntity[];
  environmentHints?: Partial<WorldEnvironment>;
  sourceLabel: string;
  license: ForgeLicenseInfo;
}

export interface WorldForgeProvider {
  readonly name: ForgeProviderName;
  generate(req: ForgeRequest): Promise<ForgeResult>;
}

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG + geo helpers
// ---------------------------------------------------------------------------------------------

function seedFromLatLon(lat: number, lon: number, radiusKm: number): number {
  const s = `${lat.toFixed(6)}:${lon.toFixed(6)}:${radiusKm.toFixed(3)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG (no crypto dependency needed for procedural gen). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EARTH_RADIUS_M = 6371000;
const metersPerDegLat = () => (Math.PI / 180) * EARTH_RADIUS_M;
const metersPerDegLon = (lat: number) => (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180);

/** Approximate equirectangular projection of (lat, lon) onto meters relative to (centerLat, centerLon). */
function localOffsetM(lat: number, lon: number, centerLat: number, centerLon: number): { x: number; z: number } {
  return { x: (lon - centerLon) * metersPerDegLon(centerLat), z: (lat - centerLat) * metersPerDegLat() };
}

// ---------------------------------------------------------------------------------------------
// SyntheticProvider — deterministic procedural city generator
// ---------------------------------------------------------------------------------------------

export class SyntheticProvider implements WorldForgeProvider {
  readonly name: ForgeProviderName = 'SYNTHETIC';

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to satisfy the shared provider interface
  async generate(req: ForgeRequest): Promise<ForgeResult> {
    const { lat, lon, radiusKm } = req;
    const rand = mulberry32(seedFromLatLon(lat, lon, radiusKm));
    const radiusM = Math.max(200, radiusKm * 1000);
    const entities: ForgedEntity[] = [];

    // Terrain: a 3x3 grid of patches covering the forged area.
    const terrainDivisions = 3;
    const terrainStep = (radiusM * 2) / terrainDivisions;
    for (let ix = 0; ix < terrainDivisions; ix++) {
      for (let iz = 0; iz < terrainDivisions; iz++) {
        const x = -radiusM + terrainStep * (ix + 0.5);
        const z = -radiusM + terrainStep * (iz + 0.5);
        entities.push({
          kind: 'TERRAIN',
          name: `Terrain Patch ${ix}-${iz}`,
          transform: transformAt(x, -1, z, terrainStep),
          tags: ['forge', 'synthetic', 'terrain'],
          metadata: { source: 'SYNTHETIC', biome: rand() > 0.5 ? 'urban' : 'suburban' },
        });
      }
    }

    // Roads: a simple N/S + E/W grid.
    const roadLines = 6;
    for (let i = 0; i < roadLines; i++) {
      const offset = -radiusM + (radiusM * 2 * i) / (roadLines - 1);
      entities.push({
        kind: 'ROAD',
        name: `Avenue ${i + 1}`,
        transform: transformAt(offset, 0, 0, radiusM * 2),
        tags: ['forge', 'synthetic', 'road', 'north-south'],
        metadata: { source: 'SYNTHETIC', lanes: 2 + (i % 3) },
      });
      entities.push({
        kind: 'ROAD',
        name: `Street ${i + 1}`,
        transform: transformAt(0, 0, offset, radiusM * 2),
        tags: ['forge', 'synthetic', 'road', 'east-west'],
        metadata: { source: 'SYNTHETIC', lanes: 2 + (i % 2) },
      });
    }

    // Water: one lake or river, placed off-center deterministically.
    const hasRiver = rand() > 0.5;
    entities.push({
      kind: 'WATER',
      name: hasRiver ? 'Forged River' : 'Forged Lake',
      transform: transformAt(radiusM * 0.3 * (rand() - 0.5), -2, radiusM * 0.3 * (rand() - 0.5), radiusM * (hasRiver ? 1.6 : 0.4)),
      tags: ['forge', 'synthetic', 'water'],
      metadata: { source: 'SYNTHETIC' },
    });

    // Buildings: density scales with radius, floor of 60 so `forge` always yields a dense city
    // even for a tiny radius (this is also what keeps the "more than 50 entities" contract true).
    const buildingCount = Math.max(60, Math.round(radiusKm * radiusKm * 40));
    for (let i = 0; i < buildingCount; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * radiusM * 0.92;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const footprint = 6 + rand() * 14;
      const floors = Math.max(1, Math.round(2 + rand() * 18));
      entities.push({
        kind: 'BUILDING',
        name: `Forged Building ${i + 1}`,
        transform: transformAt(x, 0, z, footprint),
        tags: ['forge', 'synthetic', 'building'],
        metadata: { source: 'SYNTHETIC', floors },
      });
    }

    entities.push({
      kind: 'PLAYER_SPAWN',
      name: 'Forge Spawn Point',
      transform: identityTransform(),
      tags: ['forge', 'synthetic', 'spawn'],
      metadata: { source: 'SYNTHETIC' },
    });

    return {
      entities,
      environmentHints: {},
      sourceLabel: 'SYNTHETIC',
      license: { label: 'Procedurally generated — no third-party data, no license restrictions.' },
    };
  }
}

// ---------------------------------------------------------------------------------------------
// OverpassProvider — real OSM Overpass + open-elevation fetch
// ---------------------------------------------------------------------------------------------

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
interface OverpassResponse {
  elements: OverpassElement[];
}
interface ElevationResult {
  latitude?: number;
  longitude?: number;
  elevation?: number;
}
interface ElevationResponse {
  results?: ElevationResult[];
}

export interface OverpassProviderOptions {
  overpassUrl?: string;
  elevationUrl?: string;
  /** AbortSignal timeouts, in ms. */
  overpassTimeoutMs?: number;
  elevationTimeoutMs?: number;
}

/** Real fetch to OSM's Overpass API + open-elevation.com. Data is © OpenStreetMap contributors,
 * licensed ODbL-1.0 — every entity this provider emits carries that attribution in its metadata. */
export class OverpassProvider implements WorldForgeProvider {
  readonly name: ForgeProviderName = 'OVERPASS';
  private readonly overpassUrl: string;
  private readonly elevationUrl: string;
  private readonly overpassTimeoutMs: number;
  private readonly elevationTimeoutMs: number;

  constructor(opts: OverpassProviderOptions = {}) {
    this.overpassUrl = opts.overpassUrl ?? 'https://overpass-api.de/api/interpreter';
    this.elevationUrl = opts.elevationUrl ?? 'https://api.open-elevation.com/api/v1/lookup';
    this.overpassTimeoutMs = opts.overpassTimeoutMs ?? 20000;
    this.elevationTimeoutMs = opts.elevationTimeoutMs ?? 15000;
  }

  async generate(req: ForgeRequest): Promise<ForgeResult> {
    const { lat, lon, radiusKm } = req;
    const radiusM = Math.round(Math.max(50, radiusKm * 1000));
    const query =
      `[out:json][timeout:25];` +
      `(way["building"](around:${radiusM},${lat},${lon});` +
      `way["highway"](around:${radiusM},${lat},${lon});` +
      `way["natural"="water"](around:${radiusM},${lat},${lon});` +
      `way["waterway"](around:${radiusM},${lat},${lon}););` +
      `out center tags;`;

    const res = await fetch(this.overpassUrl, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(this.overpassTimeoutMs),
    });
    if (!res.ok) throw new Error(`Overpass request failed: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as OverpassResponse;

    const centers: { lat: number; lon: number }[] = [];
    for (const el of data.elements) {
      const center = el.center ?? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : undefined);
      if (center) centers.push(center);
    }
    const elevations = await this.fetchElevations(centers);

    const entities: ForgedEntity[] = [];
    let pointIdx = 0;
    for (const el of data.elements) {
      const center = el.center ?? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : undefined);
      if (!center) continue;
      const altM = elevations[pointIdx] ?? 0;
      pointIdx += 1;

      const tags = el.tags ?? {};
      let kind: EntityKind | undefined;
      if (tags.building) kind = 'BUILDING';
      else if (tags.highway) kind = 'ROAD';
      else if (tags.natural === 'water' || tags.waterway) kind = 'WATER';
      if (!kind) continue;

      const { x, z } = localOffsetM(center.lat, center.lon, lat, lon);
      const name = tags.name ?? `OSM ${kind.toLowerCase()} ${el.id}`;
      entities.push({
        kind,
        name,
        transform: transformAt(x, altM, z, 1),
        geo: { lat: center.lat, lon: center.lon, altM },
        tags: ['forge', 'osm', kind.toLowerCase()],
        metadata: { source: 'OSM_OVERPASS', osmId: el.id, osmType: el.type, license: 'ODbL-1.0', ...tags },
      });
    }

    entities.push({
      kind: 'PLAYER_SPAWN',
      name: 'Forge Spawn Point',
      transform: identityTransform(),
      geo: { lat, lon, altM: elevations[0] ?? 0 },
      tags: ['forge', 'osm', 'spawn'],
      metadata: { source: 'OSM_OVERPASS' },
    });

    return {
      entities,
      environmentHints: {},
      sourceLabel: 'OSM_OVERPASS',
      license: { spdx: 'ODbL-1.0', label: 'OpenStreetMap contributors (ODbL 1.0)', attribution: '© OpenStreetMap contributors' },
    };
  }

  private async fetchElevations(points: { lat: number; lon: number }[]): Promise<number[]> {
    if (points.length === 0) return [];
    try {
      const res = await fetch(this.elevationUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })) }),
        signal: AbortSignal.timeout(this.elevationTimeoutMs),
      });
      if (!res.ok) return points.map(() => 0);
      const data = (await res.json()) as ElevationResponse;
      return points.map((_, i) => data.results?.[i]?.elevation ?? 0);
    } catch {
      // Elevation is a nice-to-have; never fail the whole forge run over it.
      return points.map(() => 0);
    }
  }
}

export function createWorldForgeProvider(name: ForgeProviderName, opts?: OverpassProviderOptions): WorldForgeProvider {
  return name === 'OVERPASS' ? new OverpassProvider(opts) : new SyntheticProvider();
}

// ---------------------------------------------------------------------------------------------
// Theme transforms
// ---------------------------------------------------------------------------------------------

export interface ThemedForgeResult {
  entities: ForgedEntity[];
  environment: Partial<WorldEnvironment>;
}

export function applyForgeTheme(entities: ForgedEntity[], theme: ForgeTheme | undefined): ThemedForgeResult {
  if (!theme) return { entities, environment: {} };

  switch (theme) {
    case 'POST_APOCALYPTIC': {
      const themed = entities.map((e) => {
        if (e.kind === 'BUILDING') return { ...e, name: `Ruined ${e.name}`, tags: [...e.tags, 'ruined', 'apocalypse'], metadata: { ...e.metadata, condition: 'ruined' } };
        if (e.kind === 'ROAD') return { ...e, tags: [...e.tags, 'cracked'] };
        return e;
      });
      return { entities: themed, environment: { weather: 'SANDSTORM', weatherIntensity: 0.6, timeOfDay: 16, fog: { density: 0.03, color: '#7a6a55' } } };
    }
    case 'CYBERPUNK': {
      const themed = entities.map((e) =>
        e.kind === 'BUILDING' ? { ...e, name: `Neon ${e.name}`, tags: [...e.tags, 'neon', 'cyberpunk'], metadata: { ...e.metadata, glow: true } } : e,
      );
      return { entities: themed, environment: { weather: 'RAIN', weatherIntensity: 0.7, timeOfDay: 22, skybox: 'neon_night', fog: { density: 0.015, color: '#1a0f2e' } } };
    }
    case 'ZOMBIE_OUTBREAK': {
      const infected: ForgedEntity[] = entities
        .filter((e) => e.kind === 'BUILDING')
        .slice(0, 15)
        .map((b, i) => ({
          kind: 'NPC' as EntityKind,
          name: `Infected ${i + 1}`,
          transform: b.transform,
          tags: ['forge', 'zombie', 'enemy', 'infected'],
          behavior: { systemId: 'sys_combat', params: { faction: 'infected', state: 'WANDER', aggression: 0.9 } },
          metadata: { source: 'THEME_ZOMBIE_OUTBREAK' },
        }));
      const themed = entities.map((e) => (e.kind === 'BUILDING' ? { ...e, tags: [...e.tags, 'infested'] } : e));
      return { entities: [...themed, ...infected], environment: { weather: 'FOG', weatherIntensity: 0.8, timeOfDay: 3 } };
    }
    case 'FUTURE_FLOOD': {
      const flood: ForgedEntity = {
        kind: 'WATER',
        name: 'Rising Floodwater',
        transform: transformAt(0, 1.5, 0, 4000),
        tags: ['forge', 'flood'],
        metadata: { source: 'THEME_FUTURE_FLOOD' },
      };
      const themed = entities.map((e) =>
        e.kind === 'BUILDING' ? { ...e, tags: [...e.tags, 'flooded'], metadata: { ...e.metadata, waterlineM: 1.5 } } : e,
      );
      return { entities: [...themed, flood], environment: { weather: 'STORM', weatherIntensity: 0.9, timeOfDay: 13, fog: { density: 0.02, color: '#3a5f6b' } } };
    }
    default:
      return { entities, environment: {} };
  }
}
