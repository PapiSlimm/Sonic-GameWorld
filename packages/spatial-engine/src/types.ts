import type * as THREE from 'three';
import type {
  CameraMode,
  CameraRig,
  CinematicSequence,
  EntityKind,
  Transform,
  WorldDocument,
  WorldEntity,
  WorldEnvironment,
  WorldLayer,
} from '@sonic-gameworld/world-schema';

/** The subset of THREE.WebGLRenderer's surface the engine actually touches. Lets tests/SSR inject a stand-in. */
export interface RendererLike {
  domElement: { width: number; height: number; toDataURL?: (type?: string) => string };
  shadowMap: { enabled: boolean };
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(ratio: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  getPixelRatio?(): number;
}

export interface SpatialEngineOptions {
  /** Real <canvas> to render into. Omit for headless (SSR/tests) — a NullRenderer is used instead. */
  canvas?: HTMLCanvasElement;
  /** Inject a custom renderer (tests, or a non-WebGL backend). Overrides `canvas`. */
  renderer?: RendererLike;
  width?: number;
  height?: number;
  pixelRatio?: number;
  antialias?: boolean;
  /** Base URL used to resolve `assetRef.assetId` into a GLB URL, e.g. `https://cdn.example.com`. */
  cdnBaseUrl?: string;
  /** `${cdnBaseUrl}/${assetId}/${variant}.glb` by default; override for a different CDN layout. */
  resolveAssetUrl?: (assetRef: NonNullable<WorldEntity['assetRef']>, cdnBaseUrl: string) => string;
  background?: string | number;
  onError?: (err: unknown) => void;
}

export interface RaycastHit {
  entityId: string;
  point: { x: number; y: number; z: number };
  distance: number;
}

export interface HUDCounts {
  players: number;
  npcs: number;
  vehicles: number;
  events: number;
  missions: number;
}

export interface HUDState {
  mode: CameraMode;
  fps: number;
  tracked: string | null;
  counts: HUDCounts;
  cursorGeo?: { lat: number; lon: number; altM: number };
  selection: string[];
  cinematic: { playing: boolean; sequenceId: string | null; shotIndex: number; fadeAlpha: number };
  weather: WorldEnvironment['weather'];
  timeOfDay: number;
}

export interface SpatialSnapshot {
  takenAt: string;
  json: {
    worldId: string | null;
    timeOfDay: number;
    weather: WorldEnvironment['weather'];
    cameraMode: CameraMode;
    cameraTransform: Transform;
    selection: string[];
    tracked: string | null;
    entityCount: number;
    hud: HUDState;
  };
  /** `data:image/png;base64,...` — empty string when rendering headlessly (no real WebGL surface). */
  png: string;
}

export type SpatialEngineEventMap = {
  select: { ids: string[] };
  hover: { id: string | null };
  entityChange: { type: 'spawn' | 'move' | 'remove' | 'load'; id: string | null };
  cameraChange: { mode: CameraMode; transition?: CinematicSequence['shots'][number]['transition'] };
  tick: { dt: number; elapsed: number };
};

export interface SetCameraModeOptions {
  targetEntityId?: string;
  params?: CameraRig['params'];
  keyframes?: CameraRig['keyframes'];
}

export interface LayerState extends WorldLayer {}

export const ENTITY_KIND_COLORS: Record<EntityKind, number> = {
  REGION: 0x2a3346,
  ZONE: 0x35405a,
  BUILDING: 0x7c5cff,
  ROOM: 0x5c4de6,
  NPC: 0xff4d6d,
  PLAYER_SPAWN: 0x38f5c8,
  ITEM: 0xffb020,
  VEHICLE: 0x38a6f5,
  TRIGGER: 0xf538c8,
  CAMERA: 0xe6edf3,
  LIGHT: 0xfff2a8,
  PROP: 0x8892a0,
  TERRAIN: 0x3d5a3d,
  WATER: 0x1f7ae0,
  ROAD: 0x505866,
  VOLUME: 0xffb02066,
  GROUP: 0x666666,
  // RTS game template (docs/RTS-CONTRACTS.md §6/§9). Raven Alliance is Blue, United Dragon
  // Nations is Red/Green by biome — but per-faction tinting is a HUD-overlay concern (§6: "render
  // as HUD overlays/tinting elsewhere, out of scope for you"), not a WorldEntity-kind color, so
  // these are neutral placeholders distinguishing unit vs. building at a glance in Studio.
  RTS_UNIT: 0x38a6f5,
  RTS_BUILDING: 0x7c5cff,
};

/** Rough per-kind "footprint" radius (meters) used to size the instanced primitive / billboard. */
export const ENTITY_KIND_RADIUS: Record<EntityKind, number> = {
  REGION: 0, // never rendered directly (too large / abstract)
  ZONE: 0,
  BUILDING: 8,
  ROOM: 3,
  NPC: 0.6,
  PLAYER_SPAWN: 0.8,
  ITEM: 0.35,
  VEHICLE: 2,
  TRIGGER: 1.2,
  CAMERA: 0.5,
  LIGHT: 0.3,
  PROP: 1,
  TERRAIN: 0,
  WATER: 0,
  ROAD: 0,
  VOLUME: 1.5,
  GROUP: 0,
  // RTS game template (docs/RTS-CONTRACTS.md §6). RTS_UNIT is a base radius for the shared
  // capsule geometry (src/rts/syncEntities.ts scales individual units up/down per `unitClass` via
  // `transform.scale` — see that file); RTS_BUILDING is sized so the shared box, scaled per
  // instance by `sizeCells * cellSizeM`, starts from a sensible default footprint.
  RTS_UNIT: 1.2,
  RTS_BUILDING: 6,
};

/** Kinds rendered as instanced primitives. REGION/ZONE/ROAD/TERRAIN/WATER/GROUP are structural/abstract and skipped. */
export const RENDERABLE_KINDS: EntityKind[] = [
  'BUILDING', 'ROOM', 'NPC', 'PLAYER_SPAWN', 'ITEM', 'VEHICLE', 'TRIGGER', 'CAMERA', 'LIGHT', 'PROP', 'VOLUME',
  'RTS_UNIT', 'RTS_BUILDING',
];

export type { WorldDocument, WorldEntity, WorldLayer, WorldEnvironment };
