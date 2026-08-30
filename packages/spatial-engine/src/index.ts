export const PACKAGE_NAME = '@sonic-gameworld/spatial-engine';

// ---- Core engine ----
export { SpatialEngine } from './engine/SpatialEngine.js';
export { CameraController, type TargetSample } from './camera/CameraController.js';
export { createRenderer, NullRenderer, type CreateRendererOptions } from './engine/renderer.js';
export { EntityRegistry, ENTITY_KIND_TO_LAYER, type EntitySlot, type ResolveAssetUrl } from './engine/entities.js';
export { DetectionOverlay } from './engine/detection.js';

// ---- RTS integration (docs/RTS-CONTRACTS.md §6) ----
export {
  syncRTSEntities,
  rtsUnitEntityId,
  rtsBuildingEntityId,
  parseRTSEntityId,
  quaternionFromRotationY,
  RTS_UNIT_ENTITY_PREFIX,
  RTS_BUILDING_ENTITY_PREFIX,
  type SyncRTSEntitiesOptions,
} from './rts/syncEntities.js';
export { EnvironmentController, skyForTimeOfDay } from './engine/environment.js';
export { CinematicPlayer, type CinematicState, type CinematicTickResult } from './engine/cinematic.js';
export { interpolateKeyframes, type InterpolatedFrame } from './engine/keyframes.js';
export { localPointToGeo } from './engine/geo.js';
export { loadGLTF, clearGLTFCache } from './engine/gltf.js';

// ---- Camera modes (exposed individually per §11: "implement each mode's update() in src/camera/modes/*.ts") ----
export { OrbitMode } from './camera/modes/orbit.js';
export { FollowMode } from './camera/modes/follow.js';
export { ChaseMode } from './camera/modes/chase.js';
export { DroneMode } from './camera/modes/drone.js';
export { FirstPersonMode } from './camera/modes/firstPerson.js';
export { ThirdPersonMode } from './camera/modes/thirdPerson.js';
export { RailMode } from './camera/modes/rail.js';
export { CraneMode } from './camera/modes/crane.js';
export { AIDirectorMode } from './camera/modes/aiDirector.js';
export { RTSMode, type RTSModeParams } from './camera/modes/rts.js';
export { damp, dampVec3, dampingToLambda } from './camera/damping.js';
export { entityForward, FORWARD, UP, type CameraModeContext, type CameraModeHandler } from './camera/types.js';

// ---- Events ----
export { TinyEmitter, type Unsubscribe } from './events.js';

// ---- Types ----
export type {
  RendererLike,
  SpatialEngineOptions,
  RaycastHit,
  HUDCounts,
  HUDState,
  SpatialSnapshot,
  SpatialEngineEventMap,
  SetCameraModeOptions,
  LayerState,
} from './types.js';
export { ENTITY_KIND_COLORS, ENTITY_KIND_RADIUS, RENDERABLE_KINDS } from './types.js';

// ---- Spatial discovery (marketplace globe) ----
export {
  buildDiscoveryGraph,
  type DiscoveryProduct,
  type DiscoveryNode,
  type DiscoveryEdge,
  type DiscoveryEdgeKind,
  type DiscoveryGraph,
  type BuildDiscoveryGraphOptions,
} from './discovery/buildDiscoveryGraph.js';
export { DiscoveryGlobeRenderer, type DiscoveryGlobeOptions } from './discovery/DiscoveryGlobeRenderer.js';
