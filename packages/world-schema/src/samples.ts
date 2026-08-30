import { seededUuid, transformAt, vec3, type Transform } from './primitives.js';
import { LICENSE_PRESETS } from './license.js';
import type { CameraRig, EntityKind, MissionDefinition, NPCDefinition, WorldDocument, WorldEntity } from './schema.js';
import { createEmptyWorld } from './world.js';

export type SampleWorldName = 'NEON_TOKYO_2099';

export const SAMPLE_WORLD_IDS: Record<SampleWorldName, string> = {
  NEON_TOKYO_2099: seededUuid('world:NEON_TOKYO_2099'),
};

export const SAMPLE_OWNER_ID = 'usr_sample_creator';

export interface SampleWorldOptions {
  ownerId?: string;
  now?: Date;
}

/** Stable entity id for a sample world entity (so seeds, tests and docs can reference them). */
export function sampleEntityId(world: SampleWorldName, key: string): string {
  return seededUuid(`${world}:entity:${key}`);
}

interface Spec {
  key: string;
  kind: EntityKind;
  name: string;
  parent?: string;
  at: [number, number, number];
  scale?: number;
  tags?: string[];
  behavior?: WorldEntity['behavior'];
  ai?: WorldEntity['ai'];
  assetRef?: WorldEntity['assetRef'];
  metadata?: Record<string, unknown>;
  transform?: Transform;
}

function buildEntities(world: SampleWorldName, ownerId: string, specs: Spec[]): WorldEntity[] {
  return specs.map((s) => ({
    id: sampleEntityId(world, s.key),
    kind: s.kind,
    name: s.name,
    ...(s.parent ? { parentId: sampleEntityId(world, s.parent) } : {}),
    transform: s.transform ?? transformAt(s.at[0], s.at[1], s.at[2], s.scale ?? 1),
    ...(s.assetRef ? { assetRef: s.assetRef } : {}),
    ...(s.behavior ? { behavior: s.behavior } : {}),
    ...(s.ai ? { ai: s.ai } : {}),
    tags: s.tags ?? [],
    permissions: { ownerId, editors: [], visibility: 'PUBLIC' },
    metadata: s.metadata ?? {},
  }));
}

const W: SampleWorldName = 'NEON_TOKYO_2099';
const E = (key: string) => sampleEntityId(W, key);

export const NEON_TOKYO_NPCS: NPCDefinition[] = [
  {
    id: seededUuid('npc:detective-morgan'),
    name: 'Detective Morgan',
    characterAssetId: 'asset_char_detective_morgan',
    voice: { provider: 'elevenlabs', voiceId: 'morgan-noir' },
    personality: { traits: ['weary', 'observant', 'incorruptible', 'dry humor'], backstory: 'Twenty years in Shinjuku PD, the last five hunting the Kuro-Neko syndicate after they framed her partner.', goals: ['expose the Kuro-Neko gang leader', 'protect civilians in Kabukicho', 'recruit the player as an informant'], tone: 'terse, noir' },
    memory: { enabled: true, capacity: 500 },
    knowledge: { kbIds: ['kb_shinjuku_pd_cases', 'kb_neon_tokyo_lore'] },
    behavior: { treeId: 'bt_detective_patrol', states: ['PATROL', 'INVESTIGATE', 'DIALOGUE', 'COMBAT'], aggression: 0.3, faction: 'police' },
    dialogue: { style: 'noir monologue', openingLines: ['You look like someone who has seen the rain too many nights in a row.', 'Kabukicho eats people. Tell me why it should not eat you.'] },
    questLogic: { missionIds: [seededUuid('mission:neon:1')] },
    relationships: [{ npcId: seededUuid('npc:gang-leader'), affinity: -0.9 }, { npcId: seededUuid('npc:fantasy-merchant'), affinity: 0.2 }],
  },
  {
    id: seededUuid('npc:gang-leader'),
    name: 'Cyberpunk Gang Leader',
    characterAssetId: 'asset_char_kuroneko_leader',
    voice: { provider: 'elevenlabs', voiceId: 'kuro-neko' },
    personality: { traits: ['charismatic', 'ruthless', 'theatrical', 'paranoid'], backstory: 'Rose from a Shibuya courier to leader of the Kuro-Neko syndicate; runs neural-implant smuggling out of Building 7.', goals: ['control the Shinjuku neon district', 'eliminate Detective Morgan', 'sell the prototype cortex chip'], tone: 'menacing, playful' },
    memory: { enabled: true, capacity: 300 },
    knowledge: { kbIds: ['kb_kuroneko_ops'] },
    behavior: { treeId: 'bt_boss_arena', states: ['IDLE', 'TAUNT', 'COMBAT', 'RETREAT', 'ENRAGED'], aggression: 0.95, faction: 'kuro-neko' },
    dialogue: { style: 'villain monologue', openingLines: ['Welcome to my tower. Leaving is the expensive part.', 'Morgan sent you? She always did like lost causes.'] },
    questLogic: { missionIds: [seededUuid('mission:neon:3')] },
    relationships: [{ npcId: seededUuid('npc:detective-morgan'), affinity: -1 }],
  },
  {
    id: seededUuid('npc:fantasy-merchant'),
    name: 'Fantasy Merchant',
    characterAssetId: 'asset_char_merchant_yuki',
    voice: { provider: 'elevenlabs', voiceId: 'merchant-warm' },
    personality: { traits: ['cheerful', 'shrewd', 'superstitious', 'well-connected'], backstory: 'A displaced enchanter from a collapsed VR realm who now trades relics and black-market cyberware in the Golden Gai night market.', goals: ['sell rare items', 'gather rumors', 'stay neutral between factions'], tone: 'warm, mercantile' },
    memory: { enabled: true, capacity: 200 },
    knowledge: { kbIds: ['kb_market_inventory', 'kb_neon_tokyo_lore'] },
    behavior: { treeId: 'bt_merchant', states: ['IDLE', 'TRADE', 'DIALOGUE', 'FLEE'], aggression: 0, faction: 'neutral' },
    dialogue: { style: 'merchant banter', openingLines: ['Ah, a customer with a pulse! Come, come — I have relics from three worlds.', 'The rain is good for business. Everyone needs a dry place and a better weapon.'] },
    questLogic: { missionIds: [seededUuid('mission:neon:2')] },
    relationships: [{ npcId: seededUuid('npc:detective-morgan'), affinity: 0.4 }, { npcId: seededUuid('npc:gang-leader'), affinity: -0.3 }],
  },
];

export function createNeonTokyoMissions(): MissionDefinition[] {
  const chainId = seededUuid('chain:neon-tokyo-main');
  return [
    {
      id: seededUuid('mission:neon:1'),
      name: 'Rain Over Kabukicho',
      description: 'Meet Detective Morgan at the Shinjuku precinct and track the Kuro-Neko courier through the night market.',
      chainId,
      order: 1,
      difficulty: 3,
      state: 'ACTIVE',
      objectives: [
        { id: 'obj_1_1', type: 'REACH', targetEntityId: E('bld_precinct'), description: 'Reach the Shinjuku precinct', conditions: [] },
        { id: 'obj_1_2', type: 'INTERACT', targetEntityId: E('npc_morgan'), description: 'Talk to Detective Morgan', conditions: [{ op: 'EQ', key: 'dialogue.morgan.intro', value: true }] },
        { id: 'obj_1_3', type: 'ESCORT', targetEntityId: E('npc_courier'), description: 'Tail the courier to Golden Gai without being spotted', timeLimitS: 300, conditions: [{ op: 'LT', key: 'player.detection', value: 0.8 }] },
      ],
      triggers: [
        { id: 'trg_1_start', kind: 'ENTER_VOLUME', entityId: E('vol_precinct_lobby'), params: {}, actions: [{ tool: 'set_weather', args: { weather: 'RAIN', intensity: 0.8 } }] },
        { id: 'trg_1_music', kind: 'EVENT', event: 'objective.obj_1_2.complete', params: { cue: 'noir_theme' }, actions: [{ tool: 'move_camera', args: { mode: 'CHASE', targetEntity: E('npc_courier') } }] },
      ],
      rewards: [{ type: 'XP', amount: 250 }, { type: 'CURRENCY', amount: 500 }],
    },
    {
      id: seededUuid('mission:neon:2'),
      name: 'The Merchant of Golden Gai',
      description: 'Collect three relic fragments for the Fantasy Merchant to unlock the neural decryptor.',
      chainId,
      order: 2,
      difficulty: 5,
      state: 'DRAFT',
      objectives: [
        { id: 'obj_2_1', type: 'INTERACT', targetEntityId: E('npc_merchant'), description: 'Speak with the Fantasy Merchant', conditions: [] },
        { id: 'obj_2_2', type: 'COLLECT', count: 3, targetEntityId: E('item_relic_1'), description: 'Collect 3 relic fragments across the district', conditions: [] },
        { id: 'obj_2_3', type: 'SURVIVE', timeLimitS: 120, description: 'Survive the gang ambush at the market', conditions: [{ op: 'GT', key: 'player.health', value: 0 }] },
      ],
      triggers: [
        { id: 'trg_2_ambush', kind: 'EVENT', event: 'objective.obj_2_2.complete', params: {}, actions: [{ tool: 'spawn_npc', args: { archetype: 'gang_enforcer', count: 4, placement: { relation: 'AROUND', anchor: E('bld_market'), radiusM: 25 } } }] },
      ],
      rewards: [{ type: 'ITEM', itemId: 'item_neural_decryptor' }, { type: 'XP', amount: 600 }],
    },
    {
      id: seededUuid('mission:neon:3'),
      name: 'Tower Seven',
      description: 'Breach Building 7, defeat the Cyberpunk Gang Leader in the rooftop arena and extract via the drone pad.',
      chainId,
      order: 3,
      difficulty: 8,
      state: 'DRAFT',
      objectives: [
        { id: 'obj_3_1', type: 'REACH', targetEntityId: E('room_b7_lobby'), description: 'Breach the Building 7 lobby', conditions: [] },
        { id: 'obj_3_2', type: 'KILL', count: 3, targetEntityId: E('npc_guard_1'), description: 'Neutralize the tower guards', conditions: [] },
        { id: 'obj_3_3', type: 'DEFEND', targetEntityId: E('room_b7_roof'), timeLimitS: 240, description: 'Hold the rooftop arena against the boss', conditions: [] },
        { id: 'obj_3_4', type: 'REACH', targetEntityId: E('trg_extraction'), description: 'Extract at the drone pad', conditions: [{ op: 'HAS', key: 'inventory', value: 'item_cortex_chip' }] },
      ],
      triggers: [
        { id: 'trg_3_boss', kind: 'ENTER_VOLUME', entityId: E('room_b7_roof'), params: {}, actions: [{ tool: 'set_weather', args: { weather: 'STORM', intensity: 1 } }, { tool: 'create_cinematic', args: { name: 'Boss reveal', subject: E('npc_boss') } }] },
        { id: 'trg_3_extract', kind: 'ENTER_VOLUME', entityId: E('trg_extraction'), params: {}, actions: [{ tool: 'track_entity', args: { entity: E('veh_drone') } }] },
      ],
      rewards: [{ type: 'UNLOCK', itemId: 'unlock_district_shibuya' }, { type: 'XP', amount: 1500 }, { type: 'CURRENCY', amount: 5000 }],
    },
  ];
}

export function createNeonTokyoCameras(): CameraRig[] {
  return [
    { id: seededUuid('cam:neon:orbit'), name: 'District Orbit', mode: 'ORBIT', keyframes: [], params: { distance: 220, height: 120, damping: 0.08, fov: 55 } },
    { id: seededUuid('cam:neon:follow-player'), name: 'Follow Player', mode: 'FOLLOW', targetEntityId: E('spawn_main'), keyframes: [], params: { distance: 8, height: 3, damping: 0.15, fov: 70 } },
    { id: seededUuid('cam:neon:drone'), name: 'Skyline Drone', mode: 'DRONE', keyframes: [
      { t: 0, transform: transformAt(-300, 180, -300), fov: 60 },
      { t: 6, transform: transformAt(0, 220, -120), fov: 50 },
      { t: 12, transform: transformAt(260, 160, 200), fov: 60 },
    ], params: { damping: 0.05, fov: 60, dof: { focusM: 120, aperture: 2.8 } } },
    { id: seededUuid('cam:neon:boss'), name: 'Boss Arena Crane', mode: 'CRANE', targetEntityId: E('npc_boss'), keyframes: [], params: { distance: 30, height: 18, damping: 0.1, fov: 45 } },
  ];
}

/**
 * NEON_TOKYO_2099 — a dense cyberpunk district: 2 regions, 4 zones, 8 buildings, 4 rooms, 11 NPCs,
 * 4 vehicles, 3 triggers/volumes, 2 cameras, spawns, items, lights, roads, water, props (~44 entities) and 3 missions.
 */
export function createSampleWorld(name: SampleWorldName, opts: SampleWorldOptions = {}): WorldDocument {
  if (name !== 'NEON_TOKYO_2099') throw new Error(`Unknown sample world: ${String(name)}`);
  const ownerId = opts.ownerId ?? SAMPLE_OWNER_ID;
  const now = opts.now ?? new Date('2099-01-01T00:00:00.000Z');
  const doc = createEmptyWorld({
    id: SAMPLE_WORLD_IDS.NEON_TOKYO_2099,
    name: 'Neon Tokyo 2099',
    description: 'A rain-soaked Shinjuku district in 2099: neon towers, syndicate strongholds, a hidden night market and an AI detective who needs your help.',
    ownerId,
    genre: ['CYBERPUNK', 'OPEN_WORLD', 'SHOOTER'],
    sizeKm2: 2.5,
    maxPlayers: 32,
    halfExtentM: 800,
    license: LICENSE_PRESETS.STANDARD('lic_neon_tokyo_2099'),
    now,
  });
  doc.origin = { lat: 35.6938, lon: 139.7034, altM: 40 };
  doc.environment = { timeOfDay: 22.5, weather: 'RAIN', weatherIntensity: 0.65, skybox: 'neon_night', fog: { density: 0.012, color: '#1a0f2e' }, gravity: -9.81 };

  const gang = { systemId: 'sys_combat', params: { faction: 'kuro-neko', state: 'PATROL', aggression: 0.8 } };
  const civilian = { systemId: 'sys_crowd', params: { faction: 'civilian', state: 'WANDER', aggression: 0 } };
  const police = { systemId: 'sys_combat', params: { faction: 'police', state: 'PATROL', aggression: 0.4 } };

  const specs: Spec[] = [
    // Regions
    { key: 'reg_shinjuku', kind: 'REGION', name: 'Shinjuku', at: [0, 0, 0], scale: 800, tags: ['district', 'city-center'], metadata: { population: 42000, spatialLevel: 'CITY' } },
    { key: 'reg_shibuya', kind: 'REGION', name: 'Shibuya Fringe', at: [600, 0, -500], scale: 300, tags: ['district', 'locked'], metadata: { unlockedBy: 'unlock_district_shibuya', spatialLevel: 'CITY' } },
    // Zones
    { key: 'zone_kabukicho', kind: 'ZONE', name: 'Kabukicho', parent: 'reg_shinjuku', at: [-200, 0, 150], scale: 250, tags: ['nightlife', 'danger'], metadata: { spatialLevel: 'DISTRICT', threat: 'high' } },
    { key: 'zone_golden_gai', kind: 'ZONE', name: 'Golden Gai', parent: 'reg_shinjuku', at: [80, 0, 220], scale: 120, tags: ['market', 'neutral'], metadata: { spatialLevel: 'DISTRICT', threat: 'low' } },
    { key: 'zone_skyline', kind: 'ZONE', name: 'Skyline Towers', parent: 'reg_shinjuku', at: [250, 0, -180], scale: 300, tags: ['corporate', 'boss'], metadata: { spatialLevel: 'DISTRICT', threat: 'extreme' } },
    { key: 'zone_station', kind: 'ZONE', name: 'Station Underpass', parent: 'reg_shinjuku', at: [-60, -12, -260], scale: 180, tags: ['transit'], metadata: { spatialLevel: 'DISTRICT', threat: 'medium' } },
    // Buildings
    { key: 'bld_precinct', kind: 'BUILDING', name: 'Shinjuku Precinct', parent: 'zone_station', at: [-40, 0, -200], scale: 30, tags: ['police', 'safe-zone'], assetRef: { assetId: 'asset_bld_precinct', variant: 'HIGH' }, metadata: { floors: 6, spatialLevel: 'BUILDING' } },
    { key: 'bld_tower7', kind: 'BUILDING', name: 'Building 7', parent: 'zone_skyline', at: [260, 0, -160], scale: 60, tags: ['syndicate', 'boss-arena', 'tower'], assetRef: { assetId: 'asset_bld_tower7', variant: 'ULTRA' }, metadata: { floors: 48, spatialLevel: 'BUILDING' } },
    { key: 'bld_market', kind: 'BUILDING', name: 'Golden Gai Night Market', parent: 'zone_golden_gai', at: [90, 0, 230], scale: 25, tags: ['market', 'vendor'], assetRef: { assetId: 'asset_bld_market', variant: 'HIGH' }, metadata: { floors: 2, spatialLevel: 'BUILDING' } },
    { key: 'bld_pachinko', kind: 'BUILDING', name: 'Lucky Cat Pachinko', parent: 'zone_kabukicho', at: [-230, 0, 120], scale: 22, tags: ['nightlife', 'syndicate-front'], assetRef: { assetId: 'asset_bld_pachinko', variant: 'MEDIUM' }, metadata: { floors: 3, spatialLevel: 'BUILDING' } },
    { key: 'bld_ramen', kind: 'BUILDING', name: 'Midnight Ramen', parent: 'zone_kabukicho', at: [-170, 0, 190], scale: 12, tags: ['food', 'safe-zone'], assetRef: { assetId: 'asset_bld_ramen', variant: 'MEDIUM' }, metadata: { floors: 1, spatialLevel: 'BUILDING' } },
    { key: 'bld_hotel', kind: 'BUILDING', name: 'Hotel Kaleido', parent: 'zone_kabukicho', at: [-280, 0, 60], scale: 35, tags: ['nightlife'], assetRef: { assetId: 'asset_bld_hotel', variant: 'HIGH' }, metadata: { floors: 22, spatialLevel: 'BUILDING' } },
    { key: 'bld_corp', kind: 'BUILDING', name: 'Hoshino Corp HQ', parent: 'zone_skyline', at: [340, 0, -260], scale: 70, tags: ['corporate'], assetRef: { assetId: 'asset_bld_corp', variant: 'HIGH' }, metadata: { floors: 60, spatialLevel: 'BUILDING' } },
    { key: 'bld_station', kind: 'BUILDING', name: 'Shinjuku Station East', parent: 'zone_station', at: [-90, -10, -300], scale: 45, tags: ['transit', 'spawn'], assetRef: { assetId: 'asset_bld_station', variant: 'HIGH' }, metadata: { floors: 4, spatialLevel: 'BUILDING' } },
    // Rooms
    { key: 'room_b7_lobby', kind: 'ROOM', name: 'Building 7 Lobby', parent: 'bld_tower7', at: [260, 2, -160], scale: 20, tags: ['interior'], metadata: { floor: 0, spatialLevel: 'ROOM' } },
    { key: 'room_b7_lab', kind: 'ROOM', name: 'Building 7 Implant Lab', parent: 'bld_tower7', at: [260, 90, -160], scale: 15, tags: ['interior', 'objective'], metadata: { floor: 30, spatialLevel: 'ROOM' } },
    { key: 'room_b7_roof', kind: 'ROOM', name: 'Building 7 Rooftop Arena', parent: 'bld_tower7', at: [260, 150, -160], scale: 40, tags: ['interior', 'boss-arena'], metadata: { floor: 48, spatialLevel: 'ROOM', arena: true } },
    { key: 'room_precinct_lobby', kind: 'ROOM', name: 'Precinct Lobby', parent: 'bld_precinct', at: [-40, 2, -200], scale: 12, tags: ['interior', 'safe-zone'], metadata: { floor: 0, spatialLevel: 'ROOM' } },
    // Spawns
    { key: 'spawn_main', kind: 'PLAYER_SPAWN', name: 'Player Spawn (Station)', parent: 'zone_station', at: [-90, 0, -250], tags: ['spawn', 'default'], metadata: { team: 'any' } },
    { key: 'spawn_market', kind: 'PLAYER_SPAWN', name: 'Player Spawn (Market)', parent: 'zone_golden_gai', at: [120, 0, 260], tags: ['spawn'], metadata: { team: 'any', unlockedBy: 'mission:neon:1' } },
    // NPCs
    { key: 'npc_morgan', kind: 'NPC', name: 'Detective Morgan', parent: 'room_precinct_lobby', at: [-38, 0, -198], tags: ['npc', 'quest-giver', 'police'], behavior: police, ai: { agentId: seededUuid('npc:detective-morgan'), personalityId: 'pers_noir_detective', memoryEnabled: true }, assetRef: { assetId: 'asset_char_detective_morgan', variant: 'HIGH' } },
    { key: 'npc_merchant', kind: 'NPC', name: 'Fantasy Merchant', parent: 'bld_market', at: [92, 0, 232], tags: ['npc', 'vendor', 'neutral'], behavior: { systemId: 'sys_dialogue', params: { faction: 'neutral', state: 'TRADE' } }, ai: { agentId: seededUuid('npc:fantasy-merchant'), personalityId: 'pers_merchant', memoryEnabled: true }, assetRef: { assetId: 'asset_char_merchant_yuki', variant: 'HIGH' } },
    { key: 'npc_boss', kind: 'NPC', name: 'Cyberpunk Gang Leader', parent: 'room_b7_roof', at: [262, 150, -158], tags: ['npc', 'enemy', 'boss', 'kuro-neko'], behavior: { systemId: 'sys_combat', params: { faction: 'kuro-neko', state: 'IDLE', aggression: 0.95, boss: true } }, ai: { agentId: seededUuid('npc:gang-leader'), personalityId: 'pers_villain', memoryEnabled: true }, assetRef: { assetId: 'asset_char_kuroneko_leader', variant: 'ULTRA' } },
    { key: 'npc_guard_1', kind: 'NPC', name: 'Tower Guard Alpha', parent: 'room_b7_lobby', at: [255, 0, -165], tags: ['npc', 'enemy', 'guard', 'kuro-neko'], behavior: gang },
    { key: 'npc_guard_2', kind: 'NPC', name: 'Tower Guard Bravo', parent: 'room_b7_lobby', at: [266, 0, -155], tags: ['npc', 'enemy', 'guard', 'kuro-neko'], behavior: gang },
    { key: 'npc_guard_3', kind: 'NPC', name: 'Tower Guard Charlie', parent: 'room_b7_lab', at: [258, 90, -160], tags: ['npc', 'enemy', 'guard', 'kuro-neko'], behavior: gang },
    { key: 'npc_courier', kind: 'NPC', name: 'Kuro-Neko Courier', parent: 'zone_kabukicho', at: [-215, 0, 135], tags: ['npc', 'enemy', 'courier', 'kuro-neko'], behavior: { systemId: 'sys_combat', params: { faction: 'kuro-neko', state: 'TRAVEL', aggression: 0.2, route: ['bld_pachinko', 'bld_market'] } } },
    { key: 'npc_officer', kind: 'NPC', name: 'Officer Tanaka', parent: 'bld_precinct', at: [-45, 0, -205], tags: ['npc', 'police', 'friendly'], behavior: police },
    { key: 'npc_civ_1', kind: 'NPC', name: 'Salaryman Ito', parent: 'zone_station', at: [-70, 0, -240], tags: ['npc', 'civilian'], behavior: civilian },
    { key: 'npc_civ_2', kind: 'NPC', name: 'Street Musician Rei', parent: 'zone_golden_gai', at: [70, 0, 205], tags: ['npc', 'civilian'], behavior: civilian },
    { key: 'npc_civ_3', kind: 'NPC', name: 'Ramen Chef Goro', parent: 'bld_ramen', at: [-168, 0, 192], tags: ['npc', 'civilian', 'vendor'], behavior: { systemId: 'sys_dialogue', params: { faction: 'civilian', state: 'WORK' } } },
    // Vehicles
    { key: 'veh_drone', kind: 'VEHICLE', name: 'Extraction Drone', parent: 'zone_skyline', at: [300, 165, -120], tags: ['vehicle', 'air', 'extraction'], behavior: { systemId: 'sys_traffic', params: { mode: 'HOVER', autonomous: true } }, assetRef: { assetId: 'asset_veh_drone', variant: 'HIGH' } },
    { key: 'veh_taxi', kind: 'VEHICLE', name: 'Autonomous Taxi 42', parent: 'reg_shinjuku', at: [-120, 0, -60], tags: ['vehicle', 'ground', 'autonomous'], behavior: { systemId: 'sys_traffic', params: { mode: 'ROUTE', autonomous: true, route: 'loop_shinjuku' } }, assetRef: { assetId: 'asset_veh_taxi', variant: 'MEDIUM' } },
    { key: 'veh_police', kind: 'VEHICLE', name: 'Police Cruiser', parent: 'zone_station', at: [-20, 0, -215], tags: ['vehicle', 'ground', 'police'], behavior: { systemId: 'sys_traffic', params: { mode: 'PARKED', faction: 'police' } } },
    { key: 'veh_bike', kind: 'VEHICLE', name: 'Kuro-Neko Street Bike', parent: 'zone_kabukicho', at: [-235, 0, 105], tags: ['vehicle', 'ground', 'kuro-neko'], behavior: { systemId: 'sys_traffic', params: { mode: 'PARKED', faction: 'kuro-neko' } } },
    // Items
    { key: 'item_relic_1', kind: 'ITEM', name: 'Relic Fragment I', parent: 'zone_kabukicho', at: [-190, 1, 100], tags: ['item', 'collectible', 'relic'], metadata: { itemId: 'item_relic_fragment', value: 400 } },
    { key: 'item_relic_2', kind: 'ITEM', name: 'Relic Fragment II', parent: 'zone_station', at: [-110, -8, -280], tags: ['item', 'collectible', 'relic'], metadata: { itemId: 'item_relic_fragment', value: 400 } },
    { key: 'item_relic_3', kind: 'ITEM', name: 'Relic Fragment III', parent: 'bld_hotel', at: [-282, 44, 58], tags: ['item', 'collectible', 'relic'], metadata: { itemId: 'item_relic_fragment', value: 400, floor: 11 } },
    { key: 'item_chip', kind: 'ITEM', name: 'Cortex Chip Prototype', parent: 'room_b7_lab', at: [262, 90, -162], tags: ['item', 'objective', 'loot'], metadata: { itemId: 'item_cortex_chip', value: 25000 } },
    // Triggers / volumes
    { key: 'vol_precinct_lobby', kind: 'VOLUME', name: 'Precinct Lobby Volume', parent: 'room_precinct_lobby', at: [-40, 2, -200], scale: 12, tags: ['volume', 'trigger'], metadata: { shape: 'box' } },
    { key: 'trg_extraction', kind: 'TRIGGER', name: 'Drone Pad Extraction', parent: 'room_b7_roof', at: [285, 150, -140], scale: 8, tags: ['trigger', 'extraction'], metadata: { kind: 'ENTER_VOLUME', radiusM: 8 } },
    { key: 'trg_market_ambush', kind: 'TRIGGER', name: 'Market Ambush Trigger', parent: 'bld_market', at: [95, 0, 240], scale: 20, tags: ['trigger', 'ambush', 'detection'], metadata: { kind: 'ENTER_VOLUME', radiusM: 20 } },
    // Cameras as entities (physical camera anchors)
    { key: 'cam_skyline_anchor', kind: 'CAMERA', name: 'Skyline Drone Anchor', parent: 'zone_skyline', at: [0, 220, -120], tags: ['camera', 'drone'], metadata: { rigId: seededUuid('cam:neon:drone') } },
    { key: 'cam_arena_anchor', kind: 'CAMERA', name: 'Arena Crane Anchor', parent: 'room_b7_roof', at: [240, 170, -190], tags: ['camera', 'crane'], metadata: { rigId: seededUuid('cam:neon:boss') } },
    // Lights, roads, water, props, terrain
    { key: 'light_neon_1', kind: 'LIGHT', name: 'Kabukicho Gate Neon', parent: 'zone_kabukicho', at: [-150, 8, 160], tags: ['light', 'neon'], metadata: { color: '#ff2d95', intensity: 4, flicker: true } },
    { key: 'light_neon_2', kind: 'LIGHT', name: 'Tower 7 Crown Light', parent: 'bld_tower7', at: [260, 170, -160], tags: ['light', 'neon', 'landmark'], metadata: { color: '#38f5c8', intensity: 12 } },
    { key: 'road_yasukuni', kind: 'ROAD', name: 'Yasukuni-dori', parent: 'reg_shinjuku', at: [0, 0, 20], scale: 700, tags: ['road', 'arterial'], metadata: { lanes: 6, traffic: 'heavy' } },
    { key: 'road_alley', kind: 'ROAD', name: 'Golden Gai Alley', parent: 'zone_golden_gai', at: [80, 0, 215], scale: 90, tags: ['road', 'alley'], metadata: { lanes: 0, traffic: 'foot' } },
    { key: 'water_canal', kind: 'WATER', name: 'Kanda Canal', parent: 'reg_shinjuku', at: [-400, -3, -400], scale: 400, tags: ['water'], metadata: { depthM: 3 } },
    { key: 'terrain_base', kind: 'TERRAIN', name: 'District Terrain', at: [0, -1, 0], scale: 1600, tags: ['terrain'], metadata: { heightmap: 'neon_tokyo_hm_v2', material: 'wet_asphalt' } },
    { key: 'prop_vending', kind: 'PROP', name: 'Vending Machine Cluster', parent: 'zone_station', at: [-75, 0, -235], tags: ['prop', 'street'], assetRef: { assetId: 'asset_prop_vending', variant: 'LOW' } },
    { key: 'prop_holo_ad', kind: 'PROP', name: 'Holographic Billboard', parent: 'bld_corp', at: [340, 120, -230], scale: 18, tags: ['prop', 'hologram', 'ad'], assetRef: { assetId: 'asset_prop_holo', variant: 'HIGH' }, metadata: { adSlot: 'hoshino_corp' } },
    { key: 'grp_boss_arena', kind: 'GROUP', name: 'Boss Arena Set', parent: 'room_b7_roof', at: [260, 150, -160], tags: ['group', 'arena'], metadata: { members: ['npc_boss', 'trg_extraction', 'cam_arena_anchor'] } },
  ];

  doc.entities = buildEntities(W, ownerId, specs);
  doc.missions = createNeonTokyoMissions();
  doc.cameras = createNeonTokyoCameras();
  doc.systems = [
    { id: 'sys_combat', name: 'Combat System', kind: 'COMBAT', config: { friendlyFire: false, ttk: 1.4 }, enabled: true },
    { id: 'sys_crowd', name: 'Crowd Simulation', kind: 'CROWD', config: { density: 0.6 }, enabled: true },
    { id: 'sys_traffic', name: 'Autonomous Traffic', kind: 'TRAFFIC', config: { vehicles: 40 }, enabled: true },
    { id: 'sys_dialogue', name: 'AI Dialogue', kind: 'DIALOGUE', config: { provider: 'mock' }, enabled: true },
    { id: 'sys_weather', name: 'Dynamic Weather', kind: 'WEATHER', config: { cycleMinutes: 30 }, enabled: true },
  ];
  doc.dependencies = [
    { productId: 'prod_neon_city_pack', versionId: 'ver_neon_city_pack_1_2_0', license: LICENSE_PRESETS.STANDARD('lic_neon_city_pack') },
    { productId: 'prod_cyber_vehicles', versionId: 'ver_cyber_vehicles_2_0_1', license: LICENSE_PRESETS.CC_BY('lic_cyber_vehicles') },
  ];
  doc.passport.dependencies = doc.dependencies.map((d) => d.productId);
  doc.passport.aiAssisted = true;
  doc.passport.modificationHistory.push({ at: now.toISOString(), by: ownerId, note: 'Seeded NEON_TOKYO_2099 sample content' });
  doc.updatedAt = now.toISOString();
  return doc;
}

export const NEON_TOKYO_ENTITY_KEYS = {
  building7: E('bld_tower7'),
  precinct: E('bld_precinct'),
  market: E('bld_market'),
  playerSpawn: E('spawn_main'),
  boss: E('npc_boss'),
  morgan: E('npc_morgan'),
  merchant: E('npc_merchant'),
  drone: E('veh_drone'),
  extraction: E('trg_extraction'),
  rooftop: E('room_b7_roof'),
} as const;

/** Convenience: origin-relative empty transform at a point. */
export const at = (x: number, y: number, z: number): Transform => transformAt(x, y, z);
export const origin = vec3;
