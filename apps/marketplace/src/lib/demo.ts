import { LICENSE_PRESETS } from '@sonic-gameworld/world-schema';
import type {
  AssetPassport,
  CreatorPassport,
  CreatorProfile,
  CreatorReputation,
  EngineTarget,
  Genre,
  LicenseRecord,
  ProductCategory,
  Review,
} from '@sonic-gameworld/gameworld-sdk';
import type { DemoProduct, ProductSpec } from './types.js';

/**
 * Offline demo dataset for GameWorld Market.
 *
 * Every data-access helper in `./data.ts` tries the live API (via
 * `@sonic-gameworld/gameworld-sdk`) first and falls back to this module when
 * the request fails — so the whole app runs standalone with zero backend,
 * which is what this sandbox needs, while remaining a drop-in real client
 * once `services/api` is reachable.
 */

// A fixed reference instant keeps "recency" scoring and fixture ordering
// deterministic across runs and CI, instead of drifting with Date.now().
const EPOCH = Date.parse('2026-08-20T00:00:00.000Z');
const daysAgo = (n: number): string => new Date(EPOCH - n * 86_400_000).toISOString();

// ---------------------------------------------------------------------------
// Creators
// ---------------------------------------------------------------------------

interface DemoCreatorSeed {
  handle: string;
  displayName: string;
  bio: string;
  verified: boolean;
  followers: number;
  reputation: Omit<CreatorReputation, 'score' | 'computedAt'>;
  badges: string[];
}

const CREATOR_SEEDS: DemoCreatorSeed[] = [
  {
    handle: 'novaforge',
    displayName: 'NovaForge Studios',
    bio: 'Open-world environments and city kits built for spatial AI direction.',
    verified: true,
    followers: 18420,
    reputation: { quality: 92, reliability: 95, sales: 88, updates: 90, reviews: 91, support: 86, originality: 84, compliance: 97 },
    badges: ['TOP_SELLER', 'VERIFIED_STUDIO', 'FAST_SUPPORT'],
  },
  {
    handle: 'voidscape',
    displayName: 'Voidscape Collective',
    bio: 'Horror and survival worldbuilding for engines that can take the dark.',
    verified: true,
    followers: 9110,
    reputation: { quality: 87, reliability: 82, sales: 74, updates: 79, reviews: 88, support: 77, originality: 93, compliance: 90 },
    badges: ['ORIGINALITY_AWARD'],
  },
  {
    handle: 'ironclad-ai',
    displayName: 'Ironclad AI Labs',
    bio: 'NPC brains, quest directors and behavior systems, all AI-native.',
    verified: true,
    followers: 12980,
    reputation: { quality: 90, reliability: 88, sales: 81, updates: 94, reviews: 85, support: 89, originality: 90, compliance: 92 },
    badges: ['AI_PIONEER', 'VERIFIED_STUDIO'],
  },
  {
    handle: 'cinderworks',
    displayName: 'Cinderworks',
    bio: 'Cinematic rigs and shot libraries for AI Directors and human ones too.',
    verified: false,
    followers: 4310,
    reputation: { quality: 81, reliability: 76, sales: 62, updates: 70, reviews: 80, support: 68, originality: 88, compliance: 84 },
    badges: [],
  },
  {
    handle: 'loreweaver',
    displayName: 'Loreweaver Guild',
    bio: 'Fantasy and RPG worlds, missions and NPC casts with deep lore.',
    verified: true,
    followers: 15650,
    reputation: { quality: 89, reliability: 91, sales: 85, updates: 83, reviews: 92, support: 87, originality: 86, compliance: 94 },
    badges: ['TOP_SELLER'],
  },
  {
    handle: 'kinetic-labs',
    displayName: 'Kinetic Labs',
    bio: 'Vehicles, physics rigs and racing systems tuned across four engines.',
    verified: true,
    followers: 7220,
    reputation: { quality: 84, reliability: 86, sales: 70, updates: 88, reviews: 78, support: 81, originality: 75, compliance: 89 },
    badges: ['MULTI_ENGINE'],
  },
  {
    handle: 'obsidian-collective',
    displayName: 'Obsidian Collective',
    bio: 'Tactical shooters, heist missions and mercenary characters.',
    verified: false,
    followers: 5490,
    reputation: { quality: 78, reliability: 74, sales: 58, updates: 65, reviews: 72, support: 60, originality: 80, compliance: 79 },
    badges: [],
  },
  {
    handle: 'dreamforge',
    displayName: 'Dreamforge Interactive',
    bio: 'Full turnkey experiences — playable end to end, straight out of the crate.',
    verified: true,
    followers: 21030,
    reputation: { quality: 94, reliability: 90, sales: 93, updates: 87, reviews: 95, support: 88, originality: 82, compliance: 96 },
    badges: ['TOP_SELLER', 'VERIFIED_STUDIO', 'EDITORS_CHOICE'],
  },
];

const REPUTATION_WEIGHTS = {
  quality: 0.2, reliability: 0.15, sales: 0.15, updates: 0.1, reviews: 0.15, support: 0.1, originality: 0.1, compliance: 0.05,
} as const;

/** `creatorScore` per CONTRACTS §14 — weighted 0..100, deterministic. */
export function computeCreatorScore(r: Omit<CreatorReputation, 'score' | 'computedAt'>): number {
  const raw =
    r.quality * REPUTATION_WEIGHTS.quality +
    r.reliability * REPUTATION_WEIGHTS.reliability +
    r.sales * REPUTATION_WEIGHTS.sales +
    r.updates * REPUTATION_WEIGHTS.updates +
    r.reviews * REPUTATION_WEIGHTS.reviews +
    r.support * REPUTATION_WEIGHTS.support +
    r.originality * REPUTATION_WEIGHTS.originality +
    r.compliance * REPUTATION_WEIGHTS.compliance;
  return Math.round(raw * 10) / 10;
}

export const DEMO_CREATORS: CreatorProfile[] = CREATOR_SEEDS.map((seed, i) => ({
  id: `creator_${seed.handle.replace(/-/g, '_')}`,
  userId: `user_${seed.handle.replace(/-/g, '_')}`,
  handle: seed.handle,
  displayName: seed.displayName,
  bio: seed.bio,
  avatarUrl: null,
  bannerUrl: null,
  website: `https://${seed.handle}.gameworld.dev`,
  socials: { twitter: `@${seed.handle}` },
  verified: seed.verified,
  followers: seed.followers,
  productCount: 0, // filled in below once products are built
  createdAt: daysAgo(900 - i * 40),
}));

export const DEMO_REPUTATION: Record<string, CreatorReputation> = Object.fromEntries(
  CREATOR_SEEDS.map((seed) => [
    seed.handle,
    { ...seed.reputation, score: computeCreatorScore(seed.reputation), computedAt: daysAgo(1) },
  ]),
);

function creatorByHandle(handle: string): CreatorProfile {
  const c = DEMO_CREATORS.find((x) => x.handle === handle);
  if (!c) throw new Error(`Unknown demo creator handle: ${handle}`);
  return c;
}

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------

const NO_REDISTRIBUTE_NO_AI: LicenseRecord = {
  id: 'lic_character_standard',
  commercial: true,
  personal: true,
  enterprise: false,
  redistribution: false,
  modification: true,
  multiplayer: true,
  aiTraining: false,
  resale: false,
  sublicensing: false,
  attribution: false,
  spdx: 'LicenseRef-GW-Character',
};

const ENTERPRISE_ONLY: LicenseRecord = {
  id: 'lic_system_enterprise_only',
  commercial: true,
  personal: false,
  enterprise: true,
  redistribution: true,
  modification: false,
  multiplayer: true,
  aiTraining: false,
  resale: false,
  sublicensing: true,
  attribution: false,
  seats: 25,
  spdx: 'LicenseRef-GW-Enterprise-Only',
};

const RESTRICTIVE_SINGLE_SEAT: LicenseRecord = {
  id: 'lic_single_seat',
  commercial: false,
  personal: true,
  enterprise: false,
  redistribution: false,
  modification: false,
  multiplayer: false,
  aiTraining: false,
  resale: false,
  sublicensing: false,
  attribution: true,
  attributionText: 'Personal use only — one seat',
  seats: 1,
  spdx: 'LicenseRef-GW-Personal-Single',
};

// ---------------------------------------------------------------------------
// Product fixtures
// ---------------------------------------------------------------------------

interface ProductSeed {
  slug: string;
  name: string;
  category: ProductCategory;
  genre: Genre[];
  engines: EngineTarget[];
  priceCents: number;
  creatorHandle: string;
  description: string;
  longDescription: string;
  tags: string[];
  license: LicenseRecord;
  passportSource: AssetPassport['source'];
  aiGenerated: boolean;
  aiAssisted: boolean;
  thirdPartyContent: boolean;
  rating: number;
  ratingCount: number;
  sales: number;
  featured: boolean;
  publishedDaysAgo: number;
  spec: ProductSpec;
  colorway: [string, string];
}

const SEEDS: ProductSeed[] = [
  // ---- WORLD (3) ----
  {
    slug: 'neo-kyoto-2099',
    name: 'Neo Kyoto 2099',
    category: 'WORLD', genre: ['CYBERPUNK', 'OPEN_WORLD'], engines: ['WEB', 'UNREAL'],
    priceCents: 4999, creatorHandle: 'novaforge',
    description: 'A rain-slicked 6km² megacity built for AI-directed open-world play.',
    longDescription: 'Neo Kyoto 2099 is a fully layered vertical city: elevated highways, arcology towers, a working districts system, and pre-wired weather + traffic. Ships with a NEON TOKYO 2099 lighting preset and district-level LOD tuned for both desktop and WebGPU streaming.',
    tags: ['cyberpunk', 'megacity', 'neon', 'open-world', 'vertical'],
    license: LICENSE_PRESETS.STANDARD('lic_neo_kyoto'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.8, ratingCount: 342, sales: 5210, featured: true, publishedDaysAgo: 210,
    spec: { worldSizeKm2: 6.2, maxPlayers: 128, assetCount: 3840, missionCount: 14, npcCount: 260, vehicleCount: 22 },
    colorway: ['#38F5C8', '#7C5CFF'],
  },
  {
    slug: 'aurora-steppes',
    name: 'Aurora Steppes',
    category: 'WORLD', genre: ['FANTASY', 'OPEN_WORLD'], engines: ['UNITY', 'UNREAL'],
    priceCents: 3999, creatorHandle: 'loreweaver',
    description: 'Endless windswept grassland world with nomad settlements and aurora skies.',
    longDescription: 'A 9km² open frontier with dynamic aurora weather, three nomadic factions, and a full day/night herding economy. Comes pre-populated with 40 hand-authored points of interest.',
    tags: ['fantasy', 'open-world', 'exploration', 'factions'],
    license: LICENSE_PRESETS.STANDARD('lic_aurora_steppes'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.6, ratingCount: 188, sales: 2790, featured: false, publishedDaysAgo: 160,
    spec: { worldSizeKm2: 9.4, maxPlayers: 64, assetCount: 2210, missionCount: 22, npcCount: 140, vehicleCount: 6 },
    colorway: ['#FFB020', '#38F5C8'],
  },
  {
    slug: 'sable-wastes-ashfall',
    name: 'Sable Wastes: Ashfall',
    category: 'WORLD', genre: ['SURVIVAL', 'HORROR'], engines: ['UNREAL'],
    priceCents: 5499, creatorHandle: 'voidscape',
    description: 'A blighted post-cataclysm wasteland world with a living ash-storm system.',
    longDescription: 'Sable Wastes ships with a volumetric ash-storm director, radiation zones, and a scavenger AI faction that adapts to player presence. Built for grim survival loops.',
    tags: ['survival', 'horror', 'wasteland', 'weather-system'],
    license: LICENSE_PRESETS.STANDARD('lic_sable_wastes'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: true,
    rating: 4.4, ratingCount: 96, sales: 1140, featured: false, publishedDaysAgo: 60,
    spec: { worldSizeKm2: 7.8, maxPlayers: 40, assetCount: 1980, missionCount: 11, npcCount: 95, vehicleCount: 4 },
    colorway: ['#FF4D6D', '#8B98A9'],
  },

  // ---- GAME_KIT (3) ----
  {
    slug: 'roguelike-dungeon-kit',
    name: 'Roguelike Dungeon Kit',
    category: 'GAME_KIT', genre: ['FANTASY', 'RPG'], engines: ['UNITY', 'GODOT', 'WEB'],
    priceCents: 2999, creatorHandle: 'loreweaver',
    description: 'Procedural dungeon generation, loot tables and a full run-based meta loop.',
    longDescription: 'Drop-in kit with seed-based procedural rooms, 6 biomes, a loot/rarity system and a persistent meta-progression layer. Includes a full sample dungeon and boss encounter.',
    tags: ['roguelike', 'procedural', 'dungeon', 'loot'],
    license: LICENSE_PRESETS.STANDARD('lic_roguelike_kit'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.7, ratingCount: 410, sales: 6890, featured: true, publishedDaysAgo: 300,
    spec: { assetCount: 620, missionCount: 8, npcCount: 30 },
    colorway: ['#7C5CFF', '#FFB020'],
  },
  {
    slug: 'battle-royale-toolkit',
    name: 'Battle Royale Toolkit',
    category: 'GAME_KIT', genre: ['SHOOTER', 'TACTICAL'], engines: ['UNREAL'],
    priceCents: 7999, creatorHandle: 'obsidian-collective',
    description: 'Shrinking-zone match framework with loadouts, loot drops and squads.',
    longDescription: 'A complete 100-player battle royale scaffold: shrinking safe-zone director, airdrop system, squad revive logic and a spectator camera rig.',
    tags: ['battle-royale', 'shooter', 'multiplayer', 'squads'],
    license: LICENSE_PRESETS.ENTERPRISE('lic_br_toolkit'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.2, ratingCount: 74, sales: 610, featured: false, publishedDaysAgo: 40,
    spec: { assetCount: 340, npcCount: 0, vehicleCount: 3 },
    colorway: ['#FF4D6D', '#38F5C8'],
  },
  {
    slug: 'tower-defense-core',
    name: 'Tower Defense Core',
    category: 'GAME_KIT', genre: ['STRATEGY'], engines: ['WEB', 'GODOT'],
    priceCents: 0, creatorHandle: 'kinetic-labs',
    description: 'Free grid-based tower defense core with wave director and 12 tower types.',
    longDescription: 'A free, fully playable tower-defense core: pathfinding grid, wave director with difficulty curves, and 12 towers with upgrade trees. A great starting point for jams.',
    tags: ['tower-defense', 'strategy', 'free', 'starter-kit'],
    license: LICENSE_PRESETS.CC_BY('lic_td_core'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.5, ratingCount: 260, sales: 12100, featured: false, publishedDaysAgo: 400,
    spec: { assetCount: 180 },
    colorway: ['#4CC2FF', '#38F5C8'],
  },

  // ---- SYSTEM (2) ----
  {
    slug: 'dynamic-weather-system-pro',
    name: 'Dynamic Weather System Pro',
    category: 'SYSTEM', genre: ['OTHER'], engines: ['UNITY', 'UNREAL', 'WEB'],
    priceCents: 3499, creatorHandle: 'novaforge',
    description: 'Volumetric weather director with 7 presets and smooth AI-controllable transitions.',
    longDescription: 'A cross-engine weather system exposing `set_weather`/`set_time_of_day` compatible hooks, volumetric clouds, wetness accumulation and lightning director.',
    tags: ['weather', 'system', 'ai-hooks', 'volumetric'],
    license: LICENSE_PRESETS.STANDARD('lic_weather_pro'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.9, ratingCount: 501, sales: 8340, featured: true, publishedDaysAgo: 280,
    spec: {},
    colorway: ['#4CC2FF', '#7C5CFF'],
  },
  {
    slug: 'faction-reputation-engine',
    name: 'Faction Reputation Engine',
    category: 'SYSTEM', genre: ['RPG', 'STRATEGY'], engines: ['UNITY'],
    priceCents: 5999, creatorHandle: 'ironclad-ai',
    description: 'Enterprise-grade faction standing, alliances and consequence propagation.',
    longDescription: 'Track per-player standing across unlimited factions with cascading consequence rules, treaty logic and an admin dashboard hook. Built for live-service scale.',
    tags: ['faction', 'reputation', 'enterprise', 'live-service'],
    license: ENTERPRISE_ONLY,
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.3, ratingCount: 52, sales: 190, featured: false, publishedDaysAgo: 20,
    spec: {},
    colorway: ['#FFB020', '#8B98A9'],
  },

  // ---- AI_AGENT (2) ----
  {
    slug: 'questmaster-ai-director',
    name: 'Questmaster AI Director',
    category: 'AI_AGENT', genre: ['RPG', 'OTHER'], engines: ['WEB', 'UNITY', 'UNREAL'],
    priceCents: 8999, creatorHandle: 'ironclad-ai',
    description: 'A QUESTMASTER-role agent that generates and paces branching missions live.',
    longDescription: 'Plug this agent into the AI orchestrator as a QUESTMASTER: it authors branching objectives, paces difficulty against player performance, and emits standard `create_quest`/`create_trigger` tool calls.',
    tags: ['ai-agent', 'quest', 'orchestrator', 'director'],
    license: LICENSE_PRESETS.ENTERPRISE('lic_questmaster'),
    passportSource: 'AI_ASSISTED', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.7, ratingCount: 133, sales: 980, featured: true, publishedDaysAgo: 90,
    spec: { missionCount: 0 },
    colorway: ['#7C5CFF', '#4CC2FF'],
  },
  {
    slug: 'companion-npc-brain-aria',
    name: 'Companion NPC Brain — Aria',
    category: 'AI_AGENT', genre: ['RPG'], engines: ['WEB', 'UNITY'],
    priceCents: 2499, creatorHandle: 'ironclad-ai',
    description: 'A memory-enabled companion agent with configurable personality and voice hooks.',
    longDescription: 'Aria is a ready-to-drop NPC brain: persistent memory, a configurable personality/backstory block, and voice-provider hooks. Ships with three preset personas.',
    tags: ['npc', 'companion', 'ai-agent', 'memory'],
    license: LICENSE_PRESETS.STANDARD('lic_aria'),
    passportSource: 'AI_GENERATED', aiGenerated: true, aiAssisted: false, thirdPartyContent: false,
    rating: 4.5, ratingCount: 267, sales: 3450, featured: false, publishedDaysAgo: 130,
    spec: { npcCount: 1 },
    colorway: ['#38F5C8', '#FFB020'],
  },

  // ---- CHARACTER (3) ----
  {
    slug: 'cyber-ronin-kaito',
    name: 'Cyber Ronin — Kaito',
    category: 'CHARACTER', genre: ['CYBERPUNK', 'SHOOTER'], engines: ['UNREAL', 'UNITY'],
    priceCents: 1999, creatorHandle: 'novaforge',
    description: 'Fully rigged cyberpunk mercenary character with 4 LOD variants.',
    longDescription: 'Kaito ships ULTRA through MOBILE variants, a 45-clip combat animation set, and modular cyberware attachment points.',
    tags: ['character', 'cyberpunk', 'rigged', 'combat'],
    license: NO_REDISTRIBUTE_NO_AI,
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.6, ratingCount: 214, sales: 2980, featured: false, publishedDaysAgo: 150,
    spec: {},
    colorway: ['#38F5C8', '#FF4D6D'],
  },
  {
    slug: 'frost-warden-elyra',
    name: 'Frost Warden Elyra',
    category: 'CHARACTER', genre: ['FANTASY', 'RPG'], engines: ['UNITY', 'UNREAL', 'GODOT'],
    priceCents: 1799, creatorHandle: 'loreweaver',
    description: 'Ice-themed fantasy warden with a full spellcasting animation set.',
    longDescription: 'Elyra comes with 32 spellcasting and combat animations, a cloth-simmed cloak, and an ice-VFX attachment kit.',
    tags: ['character', 'fantasy', 'spellcaster'],
    license: LICENSE_PRESETS.STANDARD('lic_elyra'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.8, ratingCount: 305, sales: 4110, featured: true, publishedDaysAgo: 190,
    spec: {},
    colorway: ['#4CC2FF', '#7C5CFF'],
  },
  {
    slug: 'scrap-golem-unit-9',
    name: 'Scrap Golem Unit-9',
    category: 'CHARACTER', genre: ['SURVIVAL', 'SCIFI'], engines: ['WEB', 'GODOT'],
    priceCents: 999, creatorHandle: 'voidscape',
    description: 'Salvaged-parts golem enemy with a modular scrap-armor system.',
    longDescription: 'A budget-friendly enemy unit built from swappable scrap-armor pieces, with a lumbering combat animation set and a break-apart death sequence.',
    tags: ['character', 'enemy', 'scifi', 'modular'],
    license: LICENSE_PRESETS.CC_BY('lic_scrap_golem'),
    passportSource: 'REMIX', aiGenerated: false, aiAssisted: true, thirdPartyContent: true,
    rating: 4.1, ratingCount: 88, sales: 1520, featured: false, publishedDaysAgo: 70,
    spec: {},
    colorway: ['#8B98A9', '#FFB020'],
  },

  // ---- VEHICLE (2) ----
  {
    slug: 'hovercycle-vex-7',
    name: 'Hovercycle Vex-7',
    category: 'VEHICLE', genre: ['RACING', 'CYBERPUNK'], engines: ['UNREAL', 'WEB'],
    priceCents: 1499, creatorHandle: 'kinetic-labs',
    description: 'Arcade-tuned anti-grav hovercycle with drift physics and boost VFX.',
    longDescription: 'Vex-7 comes with a tuned arcade physics profile, drift/boost VFX, and a livery customization slot system.',
    tags: ['vehicle', 'racing', 'hover', 'cyberpunk'],
    license: LICENSE_PRESETS.STANDARD('lic_vex7'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.4, ratingCount: 142, sales: 2010, featured: false, publishedDaysAgo: 110,
    spec: {},
    colorway: ['#7C5CFF', '#38F5C8'],
  },
  {
    slug: 'apc-juggernaut-mk2',
    name: 'APC Juggernaut Mk.II',
    category: 'VEHICLE', genre: ['TACTICAL', 'SHOOTER'], engines: ['UNREAL'],
    priceCents: 3299, creatorHandle: 'obsidian-collective',
    description: 'Armored personnel carrier with turret mount points and destructible armor plating.',
    longDescription: 'A heavy APC with a gunner turret mount, six-seat troop bay, and per-panel destructible armor with damage-state visuals.',
    tags: ['vehicle', 'military', 'tactical', 'destructible'],
    license: LICENSE_PRESETS.STANDARD('lic_juggernaut'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.3, ratingCount: 61, sales: 480, featured: false, publishedDaysAgo: 35,
    spec: {},
    colorway: ['#FF4D6D', '#8B98A9'],
  },

  // ---- ENVIRONMENT (3) ----
  {
    slug: 'bioluminescent-rainforest-biome',
    name: 'Bioluminescent Rainforest Biome',
    category: 'ENVIRONMENT', genre: ['FANTASY', 'SURVIVAL'], engines: ['UNITY', 'UNREAL'],
    priceCents: 2799, creatorHandle: 'loreweaver',
    description: 'Glowing rainforest environment kit with 200+ foliage assets and a dusk-to-night lighting rig.',
    longDescription: 'A dense biome kit: 200+ modular foliage pieces, glow-map shaders, and a pre-baked dusk-to-night lighting rig with firefly particle systems.',
    tags: ['environment', 'biome', 'foliage', 'lighting'],
    license: LICENSE_PRESETS.STANDARD('lic_rainforest'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.7, ratingCount: 176, sales: 2340, featured: false, publishedDaysAgo: 140,
    spec: { assetCount: 240 },
    colorway: ['#38F5C8', '#4CC2FF'],
  },
  {
    slug: 'derelict-orbital-station',
    name: 'Derelict Orbital Station',
    category: 'ENVIRONMENT', genre: ['SCIFI', 'HORROR'], engines: ['UNREAL'],
    priceCents: 4499, creatorHandle: 'voidscape',
    description: 'Zero-gravity derelict station interior with dynamic decompression hazards.',
    longDescription: 'A modular derelict-station interior kit with breach/decompression hazard volumes, flickering emergency lighting, and zero-g prop physics.',
    tags: ['environment', 'scifi', 'horror', 'zero-g'],
    license: LICENSE_PRESETS.STANDARD('lic_orbital_station'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.5, ratingCount: 99, sales: 870, featured: false, publishedDaysAgo: 55,
    spec: { assetCount: 310 },
    colorway: ['#8B98A9', '#7C5CFF'],
  },
  {
    slug: 'sunken-necropolis-ruins',
    name: 'Sunken Necropolis Ruins',
    category: 'ENVIRONMENT', genre: ['FANTASY', 'HORROR'], engines: ['UNITY', 'GODOT'],
    priceCents: 0, creatorHandle: 'voidscape',
    description: 'Free underwater ruins environment with a caustics lighting preset.',
    longDescription: 'A free sample environment: sunken temple ruins with underwater caustics, ambient current-driven foliage, and buried treasure prop set.',
    tags: ['environment', 'underwater', 'ruins', 'free'],
    license: LICENSE_PRESETS.CC0('lic_necropolis'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.2, ratingCount: 63, sales: 4020, featured: false, publishedDaysAgo: 260,
    spec: { assetCount: 150 },
    colorway: ['#4CC2FF', '#8B98A9'],
  },

  // ---- CINEMATIC (2) ----
  {
    slug: 'ai-director-cinematics-pack',
    name: 'AI Director Cinematics Pack',
    category: 'CINEMATIC', genre: ['OTHER'], engines: ['WEB', 'UNITY', 'UNREAL'],
    priceCents: 1999, creatorHandle: 'cinderworks',
    description: '18 camera rigs and grading presets built for the AI_DIRECTOR camera mode.',
    longDescription: 'Eighteen ready-made camera rigs (orbit, chase, crane, rail) tuned for `AI_DIRECTOR` mode hand-off, plus six color-grading presets.',
    tags: ['cinematic', 'camera', 'ai-director', 'grading'],
    license: LICENSE_PRESETS.STANDARD('lic_ai_director_pack'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.6, ratingCount: 121, sales: 1680, featured: false, publishedDaysAgo: 95,
    spec: {},
    colorway: ['#7C5CFF', '#FFB020'],
  },
  {
    slug: 'rail-shot-chase-sequence-kit',
    name: 'Rail Shot Chase Sequence Kit',
    category: 'CINEMATIC', genre: ['SHOOTER', 'RACING'], engines: ['UNREAL'],
    priceCents: 1299, creatorHandle: 'cinderworks',
    description: 'Pre-authored rail-camera chase sequences with keyframed FOV punches.',
    longDescription: 'Four rail-camera chase sequences with keyframed FOV punches, motion blur curves, and impact shake presets.',
    tags: ['cinematic', 'chase', 'rail-camera'],
    license: LICENSE_PRESETS.STANDARD('lic_rail_chase'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.0, ratingCount: 34, sales: 260, featured: false, publishedDaysAgo: 25,
    spec: {},
    colorway: ['#FF4D6D', '#38F5C8'],
  },

  // ---- MISSION (2) ----
  {
    slug: 'heist-the-obsidian-vault',
    name: 'Heist: The Obsidian Vault',
    category: 'MISSION', genre: ['TACTICAL', 'STRATEGY'], engines: ['UNREAL', 'UNITY'],
    priceCents: 1599, creatorHandle: 'obsidian-collective',
    description: 'A branching 5-objective heist mission with alarm-state escalation.',
    longDescription: 'A five-objective heist with a dynamic alarm-escalation trigger chain, two infiltration routes, and a getaway-vehicle escort finale.',
    tags: ['mission', 'heist', 'stealth', 'branching'],
    license: LICENSE_PRESETS.STANDARD('lic_obsidian_vault'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.5, ratingCount: 58, sales: 640, featured: false, publishedDaysAgo: 45,
    spec: { missionCount: 1, npcCount: 12 },
    colorway: ['#FFB020', '#FF4D6D'],
  },
  {
    slug: 'escort-convoy-rustbelt',
    name: 'Escort Convoy Through the Rustbelt',
    category: 'MISSION', genre: ['SURVIVAL', 'SHOOTER'], engines: ['UNITY'],
    priceCents: 0, creatorHandle: 'kinetic-labs',
    description: 'Free escort mission with ambush waves and a convoy-health objective.',
    longDescription: 'A free sample escort mission: three ambush waves, a convoy-health objective, and a branching route-choice trigger.',
    tags: ['mission', 'escort', 'free', 'waves'],
    license: LICENSE_PRESETS.CC0('lic_escort_convoy'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 3.9, ratingCount: 41, sales: 1980, featured: false, publishedDaysAgo: 200,
    spec: { missionCount: 1, npcCount: 18, vehicleCount: 5 },
    colorway: ['#8B98A9', '#FFB020'],
  },

  // ---- EXPERIENCE (2) ----
  {
    slug: 'neon-tokyo-2099-nightrun',
    name: 'Neon Tokyo 2099 Nightrun',
    category: 'EXPERIENCE', genre: ['CYBERPUNK', 'RACING'], engines: ['WEB'],
    priceCents: 9999, creatorHandle: 'dreamforge',
    description: 'A complete playable nightrun experience through Neo Kyoto — install and play.',
    longDescription: 'A full turnkey experience built on top of Neo Kyoto 2099: eight nightrun circuits, a rival AI roster, and a full progression/unlock economy. Playable directly in GameWorld Play.',
    tags: ['experience', 'turnkey', 'cyberpunk', 'racing'],
    license: LICENSE_PRESETS.ENTERPRISE('lic_nightrun'),
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: true, thirdPartyContent: false,
    rating: 4.9, ratingCount: 220, sales: 1890, featured: true, publishedDaysAgo: 30,
    spec: { worldSizeKm2: 6.2, maxPlayers: 32, missionCount: 8, npcCount: 40, vehicleCount: 12 },
    colorway: ['#38F5C8', '#7C5CFF'],
  },
  {
    slug: 'zero-g-arena-championship',
    name: 'Zero-G Arena Championship',
    category: 'EXPERIENCE', genre: ['SCIFI', 'SHOOTER'], engines: ['WEB', 'UNITY'],
    priceCents: 6999, creatorHandle: 'dreamforge',
    description: 'A full zero-gravity arena shooter experience with 6 maps and ranked seasons.',
    longDescription: 'A complete zero-g arena shooter: six maps, a ranked ladder with seasonal resets, and a full cosmetics economy — all playable out of the crate.',
    tags: ['experience', 'turnkey', 'scifi', 'arena', 'ranked'],
    license: RESTRICTIVE_SINGLE_SEAT,
    passportSource: 'ORIGINAL', aiGenerated: false, aiAssisted: false, thirdPartyContent: false,
    rating: 4.3, ratingCount: 47, sales: 320, featured: false, publishedDaysAgo: 15,
    spec: { maxPlayers: 12, missionCount: 6 },
    colorway: ['#4CC2FF', '#FF4D6D'],
  },
];

function refKindFor(category: ProductCategory): 'ASSET' | 'WORLD' | 'GAME' | 'NPC' | 'MISSION' | 'SYSTEM' {
  switch (category) {
    case 'WORLD':
    case 'ENVIRONMENT':
      return 'WORLD';
    case 'GAME_KIT':
    case 'EXPERIENCE':
      return 'GAME';
    case 'SYSTEM':
    case 'CINEMATIC':
      return 'SYSTEM';
    case 'AI_AGENT':
      return 'NPC';
    case 'MISSION':
      return 'MISSION';
    case 'CHARACTER':
    case 'VEHICLE':
    default:
      return 'ASSET';
  }
}

function buildPassport(seed: ProductSeed, productId: string): AssetPassport {
  const creator = creatorByHandle(seed.creatorHandle);
  return {
    assetId: `asset_${seed.slug.replace(/-/g, '_')}`,
    creatorId: creator.id,
    createdAt: daysAgo(seed.publishedDaysAgo + 20),
    version: '1.0.0',
    source: seed.passportSource,
    license: seed.license,
    dependencies: seed.category === 'EXPERIENCE' ? ['prod_neo_kyoto_2099'] : [],
    modificationHistory: [
      { at: daysAgo(seed.publishedDaysAgo + 18), by: creator.displayName, note: 'Initial creation' },
      { at: daysAgo(seed.publishedDaysAgo + 3), by: creator.displayName, note: 'Optimization + LOD pass' },
    ],
    aiGenerated: seed.aiGenerated,
    aiAssisted: seed.aiAssisted,
    thirdPartyContent: seed.thirdPartyContent,
    aiProvenance: seed.aiGenerated || seed.aiAssisted
      ? {
          model: 'gameworld-ai-mock-v1',
          version: '1.0.0',
          promptHash: `ph_${seed.slug}`.slice(0, 24),
          creatorId: creator.id,
          timestamp: daysAgo(seed.publishedDaysAgo + 19),
          humanModifications: seed.aiGenerated ? 2 : 9,
        }
      : undefined,
    marketplaceHistory: [
      { productId, at: daysAgo(seed.publishedDaysAgo), event: 'LISTED' },
      ...(seed.sales > 0 ? [{ productId, at: daysAgo(Math.max(seed.publishedDaysAgo - 5, 0)), event: 'SOLD' as const }] : []),
    ],
  };
}

function buildReviews(seed: ProductSeed, productId: string): Review[] {
  if (seed.ratingCount === 0) return [];
  const authors = [
    { id: 'user_reviewer_1', handle: 'pixel_wanderer', displayName: 'Pixel Wanderer', avatarUrl: null },
    { id: 'user_reviewer_2', handle: 'nightshift_dev', displayName: 'Nightshift Dev', avatarUrl: null },
    { id: 'user_reviewer_3', handle: 'cascade_qa', displayName: 'Cascade QA', avatarUrl: null },
  ];
  const bodies = [
    `Dropped straight into our project — ${seed.name} matched the spec sheet exactly and the ${seed.category === 'SYSTEM' ? 'hooks' : 'assets'} are clean.`,
    `Great value for the price. Support from ${creatorByHandle(seed.creatorHandle).displayName} was fast when we hit a licensing question.`,
    `Solid work overall. Docs could be a bit deeper but everything performed well in our playtests.`,
  ];
  const count = Math.min(3, Math.max(1, Math.round(seed.ratingCount / 120)));
  return Array.from({ length: count }, (_, i) => {
    const author = authors[i % authors.length]!;
    const ratingJitter = i === count - 1 && seed.rating < 4.5 ? -1 : 0;
    return {
      id: `review_${seed.slug}_${i + 1}`,
      productId,
      authorId: author.id,
      author,
      rating: Math.max(1, Math.min(5, Math.round(seed.rating) + ratingJitter)) as Review['rating'],
      title: i === 0 ? 'Exactly as described' : undefined,
      body: bodies[i % bodies.length]!,
      verifiedPurchase: true,
      helpful: (count - i) * 7 + seed.ratingCount % 5,
      createdAt: daysAgo(Math.max(seed.publishedDaysAgo - 10 - i * 15, 1)),
      creatorReply: i === 0 && seed.featured ? { body: 'Thank you for the detailed feedback!', at: daysAgo(Math.max(seed.publishedDaysAgo - 8, 1)) } : null,
    } satisfies Review;
  });
}

function buildProduct(seed: ProductSeed): DemoProduct {
  const creator = creatorByHandle(seed.creatorHandle);
  const id = `prod_${seed.slug.replace(/-/g, '_')}`;
  const publishedAt = daysAgo(seed.publishedDaysAgo);
  const passport = buildPassport(seed, id);
  const version = {
    id: `pv_${seed.slug}_1`,
    productId: id,
    version: '1.0.0',
    changelog: 'Initial release.',
    assetVersionId: passport.assetId,
    worldVersionId: undefined,
    gameVersionId: undefined,
    fileSizeBytes: 48_000_000 + seed.priceCents * 900,
    createdAt: publishedAt,
  };
  return {
    id,
    slug: seed.slug,
    name: seed.name,
    category: seed.category,
    genre: seed.genre,
    engines: seed.engines,
    priceCents: seed.priceCents,
    currency: 'USD',
    thumbnailUrl: null,
    rating: seed.rating,
    ratingCount: seed.ratingCount,
    sales: seed.sales,
    creator: { id: creator.id, handle: creator.handle, displayName: creator.displayName, avatarUrl: creator.avatarUrl, verified: creator.verified },
    licenseSummary: { commercial: seed.license.commercial, multiplayer: seed.license.multiplayer, attribution: seed.license.attribution },
    status: 'PUBLISHED',
    featured: seed.featured,
    publishedAt,
    description: seed.description,
    longDescription: seed.longDescription,
    tags: seed.tags,
    previewUrls: [],
    modelPreviewUrl: null,
    license: seed.license,
    passport,
    versions: [version],
    currentVersion: version,
    dependencies: seed.category === 'EXPERIENCE' ? [{ productId: 'prod_neo_kyoto_2099', slug: 'neo-kyoto-2099', name: 'Neo Kyoto 2099' }] : [],
    compatibility: seed.engines.map((engine) => ({ engine, tested: true })),
    refKind: refKindFor(seed.category),
    refId: `${refKindFor(seed.category).toLowerCase()}_${seed.slug.replace(/-/g, '_')}`,
    spatialPath: undefined,
    createdAt: daysAgo(seed.publishedDaysAgo + 25),
    updatedAt: daysAgo(Math.max(seed.publishedDaysAgo - 5, 0)),
    spec: seed.spec,
  } satisfies DemoProduct;
}

export const DEMO_PRODUCTS: DemoProduct[] = SEEDS.map(buildProduct);

export const DEMO_REVIEWS: Record<string, Review[]> = Object.fromEntries(
  SEEDS.map((seed) => [`prod_${seed.slug.replace(/-/g, '_')}`, buildReviews(seed, `prod_${seed.slug.replace(/-/g, '_')}`)]),
);

export const DEMO_COLORWAY: Record<string, [string, string]> = Object.fromEntries(
  SEEDS.map((seed) => [`prod_${seed.slug.replace(/-/g, '_')}`, seed.colorway]),
);

// Backfill creator.productCount now that DEMO_PRODUCTS exists.
for (const creator of DEMO_CREATORS) {
  creator.productCount = DEMO_PRODUCTS.filter((p) => p.creator.id === creator.id).length;
}

export function getDemoCreatorPassport(handle: string): CreatorPassport | undefined {
  const profile = DEMO_CREATORS.find((c) => c.handle === handle);
  if (!profile) return undefined;
  const reputationSeed = CREATOR_SEEDS.find((s) => s.handle === handle)!;
  const reputation = DEMO_REPUTATION[handle]!;
  const products = DEMO_PRODUCTS.filter((p) => p.creator.id === profile.id);
  const totalRevenueCents = products.reduce((sum, p) => sum + p.sales * p.priceCents, 0);
  const totalRatings = products.reduce((sum, p) => sum + p.ratingCount, 0);
  const weightedRating = totalRatings === 0 ? 0 : products.reduce((sum, p) => sum + p.rating * p.ratingCount, 0) / totalRatings;
  return {
    profile,
    reputation,
    badges: reputationSeed.badges,
    stats: {
      totalSales: products.reduce((sum, p) => sum + p.sales, 0),
      totalRevenueCents,
      averageRating: Math.round(weightedRating * 10) / 10,
      ratingCount: totalRatings,
    },
    featuredProducts: products.filter((p) => p.featured).length > 0 ? products.filter((p) => p.featured) : products.slice(0, 3),
  };
}

export function getDemoProductBySlug(slug: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.slug === slug);
}

export function getDemoProductById(id: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.id === id);
}
