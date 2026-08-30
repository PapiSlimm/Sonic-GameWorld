import type { EngineTarget, Genre, Product, ProductCategory } from '@sonic-gameworld/gameworld-sdk';

/**
 * The NEON TOKYO 2099-style spec table needs a few numbers the canonical
 * `Product` DTO doesn't carry (world size, headcount, mission/NPC/vehicle
 * counts). We keep them as a marketplace-local extension rather than
 * widening the shared SDK type.
 */
export interface ProductSpec {
  worldSizeKm2?: number;
  maxPlayers?: number;
  assetCount?: number;
  missionCount?: number;
  npcCount?: number;
  vehicleCount?: number;
}

export interface DemoProduct extends Product {
  spec: ProductSpec;
}

/** The three top-level clusters shown on the spatial discovery globe. */
export type DiscoveryCluster = 'WORLDS' | 'GAMES' | 'ASSETS';

export const CLUSTER_BY_CATEGORY: Record<ProductCategory, DiscoveryCluster> = {
  WORLD: 'WORLDS',
  ENVIRONMENT: 'WORLDS',
  GAME_KIT: 'GAMES',
  SYSTEM: 'GAMES',
  MISSION: 'GAMES',
  EXPERIENCE: 'GAMES',
  CINEMATIC: 'GAMES',
  AI_AGENT: 'ASSETS',
  CHARACTER: 'ASSETS',
  VEHICLE: 'ASSETS',
};

export const CLUSTER_LABEL: Record<DiscoveryCluster, string> = {
  WORLDS: 'Worlds',
  GAMES: 'Games',
  ASSETS: 'Assets',
};

export const CATEGORY_LABEL: Record<ProductCategory, string> = {
  WORLD: 'Worlds',
  GAME_KIT: 'Game Kits',
  SYSTEM: 'Systems',
  AI_AGENT: 'AI Agents',
  CHARACTER: 'Characters',
  VEHICLE: 'Vehicles',
  ENVIRONMENT: 'Environments',
  CINEMATIC: 'Cinematics',
  MISSION: 'Missions',
  EXPERIENCE: 'Experiences',
};

export const GENRE_LABEL: Record<Genre, string> = {
  FANTASY: 'Fantasy',
  SCIFI: 'Sci-Fi',
  HORROR: 'Horror',
  STRATEGY: 'Strategy',
  SHOOTER: 'Shooter',
  RACING: 'Racing',
  RPG: 'RPG',
  MMO: 'MMO',
  SURVIVAL: 'Survival',
  TACTICAL: 'Tactical',
  OPEN_WORLD: 'Open World',
  CYBERPUNK: 'Cyberpunk',
  OTHER: 'Other',
};

export const ENGINE_LABEL: Record<EngineTarget, string> = {
  WEB: 'Web',
  UNITY: 'Unity',
  UNREAL: 'Unreal',
  GODOT: 'Godot',
};
