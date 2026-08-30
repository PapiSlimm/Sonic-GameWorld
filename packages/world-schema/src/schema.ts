import { z } from 'zod';
import { GeoAnchorSchema, TransformSchema, Vec3Schema, WORLD_SCHEMA_VERSION } from './primitives.js';
import { AssetVariantSchema, GenreSchema } from './enums.js';
import { ToolCallSchema } from './ai-tools.js';

// ---- Entities ----
export const EntityKindSchema = z.enum([
  'REGION', 'ZONE', 'BUILDING', 'ROOM', 'NPC', 'PLAYER_SPAWN', 'ITEM', 'VEHICLE',
  'TRIGGER', 'CAMERA', 'LIGHT', 'PROP', 'TERRAIN', 'WATER', 'ROAD', 'VOLUME', 'GROUP',
  // RTS game template (docs/RTS-CONTRACTS.md §6) — a placeable starting unit/building for the
  // "Global Dominance" RTS map authoring flow. Safe, additive: EntityKind is a zod schema (not a
  // Postgres enum) and WorldVersion.document is a plain Json column, so no migration is needed.
  'RTS_UNIT', 'RTS_BUILDING',
]);
export type EntityKind = z.infer<typeof EntityKindSchema>;
export const ENTITY_KINDS = EntityKindSchema.options;

export const VisibilitySchema = z.enum(['PRIVATE', 'TEAM', 'PUBLIC']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const AssetRefSchema = z.object({
  assetId: z.string(),
  versionId: z.string().optional(),
  variant: AssetVariantSchema.optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const EntityBehaviorSchema = z.object({
  systemId: z.string().optional(),
  params: z.record(z.unknown()).default({}),
});
export type EntityBehavior = z.infer<typeof EntityBehaviorSchema>;

export const EntityScriptSchema = z.object({
  language: z.enum(['gwscript', 'js']),
  source: z.string(),
});
export type EntityScript = z.infer<typeof EntityScriptSchema>;

export const EntityAISchema = z.object({
  agentId: z.string().optional(),
  personalityId: z.string().optional(),
  memoryEnabled: z.boolean().default(false),
});
export type EntityAI = z.infer<typeof EntityAISchema>;

export const EntityPermissionsSchema = z.object({
  ownerId: z.string(),
  editors: z.array(z.string()).default([]),
  visibility: VisibilitySchema.default('PRIVATE'),
});
export type EntityPermissions = z.infer<typeof EntityPermissionsSchema>;

export const WorldEntitySchema = z.object({
  id: z.string().uuid(),
  kind: EntityKindSchema,
  name: z.string().min(1),
  parentId: z.string().optional(),
  transform: TransformSchema,
  geo: GeoAnchorSchema.optional(),
  assetRef: AssetRefSchema.optional(),
  behavior: EntityBehaviorSchema.optional(),
  script: EntityScriptSchema.optional(),
  ai: EntityAISchema.optional(),
  tags: z.array(z.string()).default([]),
  permissions: EntityPermissionsSchema,
  metadata: z.record(z.unknown()).default({}),
});
export type WorldEntity = z.infer<typeof WorldEntitySchema>;
export type WorldEntityInput = z.input<typeof WorldEntitySchema>;

// ---- Layers ----
export const LayerKindSchema = z.enum([
  'TERRAIN', 'BUILDINGS', 'ROADS', 'WATER', 'ENVIRONMENT', 'ENTITIES', 'NPCS', 'VEHICLES',
  'MISSIONS', 'TRIGGERS', 'CAMERAS', 'DETECTION', 'SENSORS', 'HUD', 'CUSTOM',
  // RTS game template (docs/RTS-CONTRACTS.md §6) — dedicated layers so a creator can toggle RTS
  // unit/building visibility independently of the generic VEHICLES/BUILDINGS layers.
  'RTS_UNITS', 'RTS_BUILDINGS',
]);
export type LayerKind = z.infer<typeof LayerKindSchema>;
export const LAYER_KINDS = LayerKindSchema.options;

export const WorldLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: LayerKindSchema,
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  order: z.number().int().default(0),
});
export type WorldLayer = z.infer<typeof WorldLayerSchema>;

// ---- Environment ----
export const WeatherSchema = z.enum(['CLEAR', 'CLOUDS', 'RAIN', 'STORM', 'SNOW', 'FOG', 'SANDSTORM']);
export type Weather = z.infer<typeof WeatherSchema>;
export const WEATHERS = WeatherSchema.options;

export const WorldEnvironmentSchema = z.object({
  timeOfDay: z.number().min(0).max(24).default(12),
  weather: WeatherSchema.default('CLEAR'),
  weatherIntensity: z.number().min(0).max(1).default(0),
  skybox: z.string().optional(),
  fog: z.object({ density: z.number().min(0), color: z.string() }).optional(),
  gravity: z.number().default(-9.81),
});
export type WorldEnvironment = z.infer<typeof WorldEnvironmentSchema>;

// ---- Missions ----
export const ConditionSchema = z.object({
  op: z.enum(['EQ', 'NE', 'GT', 'LT', 'HAS', 'NOT']),
  key: z.string(),
  value: z.unknown(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const ObjectiveTypeSchema = z.enum(['REACH', 'KILL', 'COLLECT', 'ESCORT', 'DEFEND', 'INTERACT', 'SURVIVE', 'CUSTOM']);
export type ObjectiveType = z.infer<typeof ObjectiveTypeSchema>;

export const ObjectiveSchema = z.object({
  id: z.string(),
  type: ObjectiveTypeSchema,
  targetEntityId: z.string().optional(),
  count: z.number().int().positive().optional(),
  timeLimitS: z.number().positive().optional(),
  description: z.string(),
  conditions: z.array(ConditionSchema).default([]),
});
export type Objective = z.infer<typeof ObjectiveSchema>;

export const TriggerKindSchema = z.enum(['ENTER_VOLUME', 'EXIT_VOLUME', 'TIMER', 'EVENT', 'PLAYER_COUNT', 'CUSTOM']);
export type TriggerKind = z.infer<typeof TriggerKindSchema>;

export const TriggerSchema = z.object({
  id: z.string(),
  kind: TriggerKindSchema,
  entityId: z.string().optional(),
  event: z.string().optional(),
  params: z.record(z.unknown()).default({}),
  actions: z.array(ToolCallSchema).default([]),
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const RewardSchema = z.object({
  type: z.enum(['XP', 'CURRENCY', 'ITEM', 'UNLOCK']),
  amount: z.number().optional(),
  itemId: z.string().optional(),
});
export type Reward = z.infer<typeof RewardSchema>;

export const MissionStateSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETE', 'FAILED']);
export type MissionState = z.infer<typeof MissionStateSchema>;

export const MissionDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  chainId: z.string().optional(),
  order: z.number().int().default(0),
  objectives: z.array(ObjectiveSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  rewards: z.array(RewardSchema).default([]),
  difficulty: z.number().int().min(1).max(10).default(5),
  state: MissionStateSchema.default('DRAFT'),
});
export type MissionDefinition = z.infer<typeof MissionDefinitionSchema>;

// ---- Cameras & cinematics ----
// 'RTS' (docs/RTS-CONTRACTS.md §6): fixed-pitch overhead strategic camera for the RTS game
// template — edge-pan/click-drag pan, scroll-wheel zoom between two bounds, no orbit/roll.
export const CameraModeSchema = z.enum(['ORBIT', 'FOLLOW', 'CHASE', 'DRONE', 'FIRST_PERSON', 'THIRD_PERSON', 'RAIL', 'CRANE', 'AI_DIRECTOR', 'RTS']);
export type CameraMode = z.infer<typeof CameraModeSchema>;
export const CAMERA_MODES = CameraModeSchema.options;

export const CameraKeyframeSchema = z.object({
  t: z.number().nonnegative(),
  transform: TransformSchema,
  fov: z.number().min(1).max(179),
});
export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

export const CameraRigSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: CameraModeSchema,
  targetEntityId: z.string().optional(),
  keyframes: z.array(CameraKeyframeSchema).default([]),
  params: z.object({
    distance: z.number().optional(),
    height: z.number().optional(),
    damping: z.number().optional(),
    fov: z.number().optional(),
    dof: z.object({ focusM: z.number(), aperture: z.number() }).optional(),
    // RTS camera mode only (docs/RTS-CONTRACTS.md §6) — see `RTSModeParams` in
    // spatial-engine/src/camera/modes/rts.ts, which reads these off `ctx.params`.
    pitchDeg: z.number().optional(),
    minDistanceM: z.number().optional(),
    maxDistanceM: z.number().optional(),
  }).default({}),
});
export type CameraRig = z.infer<typeof CameraRigSchema>;

export const ShotTransitionSchema = z.enum(['CUT', 'FADE', 'DISSOLVE', 'WIPE']);
export type ShotTransition = z.infer<typeof ShotTransitionSchema>;

export const CinematicSequenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  shots: z.array(z.object({
    rigId: z.string(),
    durationS: z.number().positive(),
    transition: ShotTransitionSchema.default('CUT'),
  })),
  grading: z.string().optional(),
});
export type CinematicSequence = z.infer<typeof CinematicSequenceSchema>;

// ---- NPC ----
export const NPCDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  characterAssetId: z.string().optional(),
  voice: z.object({ provider: z.string(), voiceId: z.string() }).optional(),
  personality: z.object({
    traits: z.array(z.string()).default([]),
    backstory: z.string().default(''),
    goals: z.array(z.string()).default([]),
    tone: z.string().default('neutral'),
  }),
  memory: z.object({ enabled: z.boolean().default(true), capacity: z.number().int().nonnegative().default(200) }).default({}),
  knowledge: z.object({ kbIds: z.array(z.string()).default([]) }).default({}),
  behavior: z.object({
    treeId: z.string().optional(),
    states: z.array(z.string()).default(['IDLE']),
    aggression: z.number().min(0).max(1).default(0),
    faction: z.string().optional(),
  }).default({}),
  dialogue: z.object({ style: z.string().default('conversational'), openingLines: z.array(z.string()).default([]) }).default({}),
  questLogic: z.object({ missionIds: z.array(z.string()).default([]) }).optional(),
  relationships: z.array(z.object({ npcId: z.string(), affinity: z.number().min(-1).max(1) })).default([]),
});
export type NPCDefinition = z.infer<typeof NPCDefinitionSchema>;
export type NPCDefinitionInput = z.input<typeof NPCDefinitionSchema>;

// ---- Licensing & passport ----
export const LicenseRecordSchema = z.object({
  id: z.string(),
  commercial: z.boolean(),
  personal: z.boolean(),
  enterprise: z.boolean(),
  redistribution: z.boolean(),
  modification: z.boolean(),
  multiplayer: z.boolean(),
  aiTraining: z.boolean(),
  resale: z.boolean(),
  sublicensing: z.boolean(),
  attribution: z.boolean(),
  attributionText: z.string().optional(),
  seats: z.number().int().positive().optional(),
  spdx: z.string().optional(),
});
export type LicenseRecord = z.infer<typeof LicenseRecordSchema>;

export const PassportSourceSchema = z.enum(['ORIGINAL', 'IMPORTED', 'AI_GENERATED', 'AI_ASSISTED', 'REMIX']);
export type PassportSource = z.infer<typeof PassportSourceSchema>;

export const AIProvenanceSchema = z.object({
  model: z.string(),
  version: z.string(),
  promptHash: z.string(),
  creatorId: z.string(),
  timestamp: z.string(),
  humanModifications: z.number().int().nonnegative(),
});
export type AIProvenance = z.infer<typeof AIProvenanceSchema>;

export const MarketplaceHistoryEventSchema = z.enum(['LISTED', 'SOLD', 'UPDATED', 'DELISTED']);

export const AssetPassportSchema = z.object({
  assetId: z.string(),
  creatorId: z.string(),
  createdAt: z.string(),
  version: z.string(),
  source: PassportSourceSchema,
  license: LicenseRecordSchema,
  dependencies: z.array(z.string()).default([]),
  modificationHistory: z.array(z.object({ at: z.string(), by: z.string(), note: z.string() })).default([]),
  aiGenerated: z.boolean().default(false),
  aiAssisted: z.boolean().default(false),
  thirdPartyContent: z.boolean().default(false),
  aiProvenance: AIProvenanceSchema.optional(),
  marketplaceHistory: z.array(z.object({ productId: z.string(), at: z.string(), event: MarketplaceHistoryEventSchema })).default([]),
});
export type AssetPassport = z.infer<typeof AssetPassportSchema>;

// ---- Systems & dependencies ----
export const SystemRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['COMBAT', 'ECONOMY', 'INVENTORY', 'DIALOGUE', 'WEATHER', 'TRAFFIC', 'CROWD', 'PHYSICS', 'EXTRACTION', 'CUSTOM']).default('CUSTOM'),
  productId: z.string().optional(),
  versionId: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});
export type SystemRef = z.infer<typeof SystemRefSchema>;

export const WorldDependencySchema = z.object({
  productId: z.string(),
  versionId: z.string(),
  license: LicenseRecordSchema,
});
export type WorldDependency = z.infer<typeof WorldDependencySchema>;

// ---- World document ----
export const WorldBoundsSchema = z.object({ min: Vec3Schema, max: Vec3Schema });
export type WorldBounds = z.infer<typeof WorldBoundsSchema>;

export const WorldDocumentSchema = z.object({
  schemaVersion: z.literal(WORLD_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  genre: z.array(GenreSchema).default([]),
  sizeKm2: z.number().nonnegative().default(1),
  maxPlayers: z.number().int().positive().default(16),
  bounds: WorldBoundsSchema,
  origin: GeoAnchorSchema.optional(),
  layers: z.array(WorldLayerSchema).default([]),
  entities: z.array(WorldEntitySchema).default([]),
  environment: WorldEnvironmentSchema,
  missions: z.array(MissionDefinitionSchema).default([]),
  cameras: z.array(CameraRigSchema).default([]),
  systems: z.array(SystemRefSchema).default([]),
  dependencies: z.array(WorldDependencySchema).default([]),
  passport: AssetPassportSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorldDocument = z.infer<typeof WorldDocumentSchema>;
export type WorldDocumentInput = z.input<typeof WorldDocumentSchema>;
