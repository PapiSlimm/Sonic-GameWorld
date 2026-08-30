import { z } from 'zod';
import { TransformSchema, Vec3Schema } from './primitives.js';
import { GenreSchema } from './enums.js';

export const AIToolNameSchema = z.enum([
  'create_world', 'create_entity', 'modify_entity', 'delete_entity', 'modify_terrain',
  'spawn_npc', 'create_quest', 'set_weather', 'set_time_of_day', 'move_camera', 'create_camera_rig',
  'create_trigger', 'create_cinematic', 'set_layer_visibility', 'track_entity', 'publish_asset',
  'query_world', 'generate_asset', 'run_playtest', 'analyze_players',
]);
export type AIToolName = z.infer<typeof AIToolNameSchema>;
export const AI_TOOL_NAMES = AIToolNameSchema.options;

export const AIAgentRoleSchema = z.enum([
  'ORCHESTRATOR', 'BUILDER', 'DIRECTOR', 'DESIGNER', 'NPC', 'QUESTMASTER', 'CINEMATOGRAPHER', 'QA', 'ANALYST', 'PUBLISHER',
]);
export type AIAgentRole = z.infer<typeof AIAgentRoleSchema>;
export const AI_AGENT_ROLES = AIAgentRoleSchema.options;

export const AIPermissionSchema = z.enum([
  'world:read', 'world:write', 'world:publish', 'asset:read', 'asset:write', 'asset:publish',
  'npc:write', 'mission:write', 'camera:write', 'ai:generate', 'analytics:read', 'playtest:run',
]);
export type AIPermission = z.infer<typeof AIPermissionSchema>;

// Shared arg fragments
const EntityKindArg = z.enum([
  'REGION', 'ZONE', 'BUILDING', 'ROOM', 'NPC', 'PLAYER_SPAWN', 'ITEM', 'VEHICLE',
  'TRIGGER', 'CAMERA', 'LIGHT', 'PROP', 'TERRAIN', 'WATER', 'ROAD', 'VOLUME', 'GROUP',
  'RTS_UNIT', 'RTS_BUILDING',
]);
const WeatherArg = z.enum(['CLEAR', 'CLOUDS', 'RAIN', 'STORM', 'SNOW', 'FOG', 'SANDSTORM']);
const CameraModeArg = z.enum(['ORBIT', 'FOLLOW', 'CHASE', 'DRONE', 'FIRST_PERSON', 'THIRD_PERSON', 'RAIL', 'CRANE', 'AI_DIRECTOR', 'RTS']);
const LayerKindArg = z.enum([
  'TERRAIN', 'BUILDINGS', 'ROADS', 'WATER', 'ENVIRONMENT', 'ENTITIES', 'NPCS', 'VEHICLES',
  'MISSIONS', 'TRIGGERS', 'CAMERAS', 'DETECTION', 'SENSORS', 'HUD', 'CUSTOM',
  'RTS_UNITS', 'RTS_BUILDINGS',
]);

/** Relative placement used by natural-language commands ("near building 7", "behind the player"). */
export const PlacementSchema = z.object({
  relation: z.enum(['NEAR', 'BEHIND', 'IN_FRONT', 'INSIDE', 'AT', 'AROUND', 'ABOVE', 'LEFT', 'RIGHT']).default('NEAR'),
  /** Entity id or human-readable name resolved by the executor. */
  anchor: z.string().optional(),
  position: Vec3Schema.optional(),
  radiusM: z.number().nonnegative().default(10),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const AI_TOOL_SCHEMAS = {
  create_world: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    genre: z.array(GenreSchema).default([]),
    sizeKm2: z.number().positive().default(1),
    maxPlayers: z.number().int().positive().default(16),
    template: z.string().optional(),
    theme: z.string().optional(),
  }),
  create_entity: z.object({
    kind: EntityKindArg,
    name: z.string().min(1),
    parentId: z.string().optional(),
    transform: TransformSchema.optional(),
    placement: PlacementSchema.optional(),
    assetId: z.string().optional(),
    tags: z.array(z.string()).default([]),
    metadata: z.record(z.unknown()).default({}),
  }),
  modify_entity: z.object({
    entityId: z.string().optional(),
    entityName: z.string().optional(),
    patch: z.record(z.unknown()),
  }).refine((v) => Boolean(v.entityId ?? v.entityName), { message: 'entityId or entityName required' }),
  delete_entity: z.object({
    entityId: z.string().optional(),
    entityName: z.string().optional(),
  }).refine((v) => Boolean(v.entityId ?? v.entityName), { message: 'entityId or entityName required' }),
  modify_terrain: z.object({
    operation: z.enum(['RAISE', 'LOWER', 'FLATTEN', 'SMOOTH', 'PAINT', 'CRATER', 'ROAD']),
    center: Vec3Schema.optional(),
    placement: PlacementSchema.optional(),
    radiusM: z.number().positive().default(25),
    strength: z.number().min(0).max(1).default(0.5),
    material: z.string().optional(),
  }),
  spawn_npc: z.object({
    archetype: z.string().min(1),
    count: z.number().int().min(1).max(500).default(1),
    placement: PlacementSchema.optional(),
    faction: z.string().optional(),
    aggression: z.number().min(0).max(1).optional(),
    behaviorState: z.string().optional(),
    personalityId: z.string().optional(),
    agentId: z.string().optional(),
  }),
  create_quest: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    objectiveType: z.enum(['REACH', 'KILL', 'COLLECT', 'ESCORT', 'DEFEND', 'INTERACT', 'SURVIVE', 'CUSTOM']).default('CUSTOM'),
    targetEntity: z.string().optional(),
    count: z.number().int().positive().optional(),
    timeLimitS: z.number().int().positive().optional(),
    difficulty: z.number().int().min(1).max(10).default(5),
    rewards: z.array(z.object({ type: z.enum(['XP', 'CURRENCY', 'ITEM', 'UNLOCK']), amount: z.number().optional(), itemId: z.string().optional() })).default([]),
    chainId: z.string().optional(),
  }),
  set_weather: z.object({
    weather: WeatherArg,
    intensity: z.number().min(0).max(1).default(0.7),
    transitionS: z.number().nonnegative().default(10),
  }),
  set_time_of_day: z.object({
    hour: z.number().min(0).max(24),
    transitionS: z.number().nonnegative().default(5),
  }),
  move_camera: z.object({
    mode: CameraModeArg.optional(),
    targetEntity: z.string().optional(),
    position: Vec3Schema.optional(),
    lookAt: Vec3Schema.optional(),
    fov: z.number().min(10).max(150).optional(),
    durationS: z.number().nonnegative().default(2),
  }),
  create_camera_rig: z.object({
    name: z.string().min(1),
    mode: CameraModeArg,
    targetEntity: z.string().optional(),
    params: z.object({
      distance: z.number().optional(),
      height: z.number().optional(),
      damping: z.number().optional(),
      fov: z.number().optional(),
    }).default({}),
  }),
  create_trigger: z.object({
    name: z.string().min(1),
    kind: z.enum(['ENTER_VOLUME', 'EXIT_VOLUME', 'TIMER', 'EVENT', 'PLAYER_COUNT', 'CUSTOM']),
    entity: z.string().optional(),
    event: z.string().optional(),
    params: z.record(z.unknown()).default({}),
    actions: z.array(z.object({ tool: AIToolNameSchema, args: z.record(z.unknown()) })).default([]),
  }),
  create_cinematic: z.object({
    name: z.string().min(1),
    subject: z.string().optional(),
    style: z.string().optional(),
    durationS: z.number().positive().default(12),
    shots: z.array(z.object({
      mode: CameraModeArg.default('DRONE'),
      durationS: z.number().positive().default(4),
      transition: z.enum(['CUT', 'FADE', 'DISSOLVE', 'WIPE']).default('CUT'),
      targetEntity: z.string().optional(),
    })).default([]),
  }),
  set_layer_visibility: z.object({
    layer: z.union([LayerKindArg, z.string()]),
    visible: z.boolean(),
  }),
  track_entity: z.object({
    entity: z.string().min(1),
    cameraMode: CameraModeArg.default('FOLLOW'),
    highlight: z.boolean().default(true),
  }),
  publish_asset: z.object({
    target: z.enum(['WORLD', 'GAME', 'ASSET', 'PRODUCT']).default('WORLD'),
    refId: z.string().optional(),
    visibility: z.enum(['PRIVATE', 'TEAM', 'PUBLIC']).default('PUBLIC'),
    priceCents: z.number().int().nonnegative().optional(),
    category: z.string().optional(),
  }),
  query_world: z.object({
    question: z.string().min(1),
    kinds: z.array(EntityKindArg).optional(),
    near: PlacementSchema.optional(),
    limit: z.number().int().positive().max(200).default(25),
  }),
  generate_asset: z.object({
    kind: z.enum(['MODEL', 'TEXTURE', 'AUDIO', 'CHARACTER', 'VEHICLE', 'ENVIRONMENT', 'PROP']),
    prompt: z.string().min(1),
    style: z.string().optional(),
    variants: z.array(z.enum(['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'MOBILE', 'WEB'])).default(['HIGH', 'WEB']),
    placement: PlacementSchema.optional(),
  }),
  run_playtest: z.object({
    bots: z.number().int().min(1).max(64).default(4),
    durationS: z.number().int().positive().default(120),
    scenario: z.string().optional(),
    missionId: z.string().optional(),
  }),
  analyze_players: z.object({
    metric: z.enum(['RETENTION', 'HEATMAP', 'FUNNEL', 'SESSION_LENGTH', 'ECONOMY', 'DIFFICULTY']).default('HEATMAP'),
    windowDays: z.number().int().positive().default(7),
    segment: z.string().optional(),
  }),
} as const satisfies Record<AIToolName, z.ZodTypeAny>;

export type AIToolArgs = { [K in AIToolName]: z.infer<(typeof AI_TOOL_SCHEMAS)[K]> };

export interface AIToolDefinition {
  name: AIToolName;
  description: string;
  permission: AIPermission;
  roles: AIAgentRole[];
  mutates: boolean;
}

export const AI_TOOL_DEFINITIONS: Record<AIToolName, AIToolDefinition> = {
  create_world: { name: 'create_world', description: 'Create a new world document from a name, genre and optional template/theme.', permission: 'world:write', roles: ['ORCHESTRATOR', 'BUILDER'], mutates: true },
  create_entity: { name: 'create_entity', description: 'Create a single entity (building, prop, light, trigger…) in the world.', permission: 'world:write', roles: ['BUILDER', 'DESIGNER'], mutates: true },
  modify_entity: { name: 'modify_entity', description: 'Patch fields on an existing entity (transform, tags, behavior, metadata).', permission: 'world:write', roles: ['BUILDER', 'DESIGNER', 'DIRECTOR'], mutates: true },
  delete_entity: { name: 'delete_entity', description: 'Remove an entity and its children from the world.', permission: 'world:write', roles: ['BUILDER'], mutates: true },
  modify_terrain: { name: 'modify_terrain', description: 'Raise, lower, flatten, paint or carve terrain in a radius.', permission: 'world:write', roles: ['BUILDER'], mutates: true },
  spawn_npc: { name: 'spawn_npc', description: 'Spawn N NPCs of an archetype near an anchor entity or position.', permission: 'npc:write', roles: ['DIRECTOR', 'BUILDER', 'NPC'], mutates: true },
  create_quest: { name: 'create_quest', description: 'Create a mission with objectives, difficulty and rewards.', permission: 'mission:write', roles: ['QUESTMASTER', 'DESIGNER'], mutates: true },
  set_weather: { name: 'set_weather', description: 'Change the world weather and intensity.', permission: 'world:write', roles: ['DIRECTOR'], mutates: true },
  set_time_of_day: { name: 'set_time_of_day', description: 'Set the world clock (0-24h).', permission: 'world:write', roles: ['DIRECTOR'], mutates: true },
  move_camera: { name: 'move_camera', description: 'Move the viewport camera or switch camera mode.', permission: 'camera:write', roles: ['DIRECTOR', 'CINEMATOGRAPHER'], mutates: false },
  create_camera_rig: { name: 'create_camera_rig', description: 'Create a reusable camera rig (orbit/follow/drone/crane…).', permission: 'camera:write', roles: ['CINEMATOGRAPHER'], mutates: true },
  create_trigger: { name: 'create_trigger', description: 'Create a trigger that runs tool actions on an event/volume.', permission: 'world:write', roles: ['DESIGNER', 'QUESTMASTER'], mutates: true },
  create_cinematic: { name: 'create_cinematic', description: 'Create a cinematic sequence of shots around a subject.', permission: 'camera:write', roles: ['CINEMATOGRAPHER', 'DIRECTOR'], mutates: true },
  set_layer_visibility: { name: 'set_layer_visibility', description: 'Show or hide a world layer.', permission: 'world:write', roles: ['DIRECTOR', 'BUILDER'], mutates: true },
  track_entity: { name: 'track_entity', description: 'Follow/track an entity in the viewport and HUD.', permission: 'world:read', roles: ['DIRECTOR', 'ANALYST'], mutates: false },
  publish_asset: { name: 'publish_asset', description: 'Publish a world, game or asset to the marketplace.', permission: 'world:publish', roles: ['PUBLISHER'], mutates: true },
  query_world: { name: 'query_world', description: 'Ask a question about world state; returns matching entities.', permission: 'world:read', roles: ['ORCHESTRATOR', 'ANALYST', 'QA'], mutates: false },
  generate_asset: { name: 'generate_asset', description: 'Generate a 3D asset, texture or audio from a prompt.', permission: 'ai:generate', roles: ['BUILDER', 'DESIGNER'], mutates: true },
  run_playtest: { name: 'run_playtest', description: 'Run a bot-driven playtest and collect results.', permission: 'playtest:run', roles: ['QA'], mutates: false },
  analyze_players: { name: 'analyze_players', description: 'Analyze player telemetry for the game/world.', permission: 'analytics:read', roles: ['ANALYST'], mutates: false },
};

export const ToolCallSchema = z.object({
  tool: AIToolNameSchema,
  args: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/** Validate a tool call's args against its schema. Returns parsed args or a list of issues. */
export function validateToolCall(call: ToolCall): { ok: true; args: Record<string, unknown> } | { ok: false; issues: string[] } {
  const schema = AI_TOOL_SCHEMAS[call.tool];
  const result = schema.safeParse(call.args);
  if (result.success) return { ok: true, args: result.data as Record<string, unknown> };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`) };
}
