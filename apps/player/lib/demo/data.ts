import {
  createSampleWorld,
  createNeonTokyoMissions,
  NEON_TOKYO_NPCS,
  NEON_TOKYO_ENTITY_KEYS,
  SAMPLE_WORLD_IDS,
  SAMPLE_OWNER_ID,
  type WorldDocument,
} from '@sonic-gameworld/world-schema';
import type {
  CreatorProfile,
  Game,
  LeaderboardEntry,
  LibraryItem,
  LiveEvent,
  Mission,
  NPC,
  World,
} from '@sonic-gameworld/gameworld-sdk';

/**
 * Offline / first-run demo content for GameWorld Play. Every rail, the play page and the
 * events page fall back to this data (see `withDemoFallback` in `lib/sdk.ts`) whenever
 * `services/api` is unreachable, so the app is fully explorable standalone.
 *
 * Built on top of `@sonic-gameworld/world-schema`'s `createSampleWorld('NEON_TOKYO_2099')` so the
 * demo world, its missions and its NPCs are the single source of truth and stay consistent with
 * each other (and with anything else in the monorepo that seeds from the same sample).
 */

export const DEMO_WORLD_ID = SAMPLE_WORLD_IDS.NEON_TOKYO_2099;
export const DEMO_GAME_ID = 'game_demo_neon_tokyo';
export const DEMO_OWNER_ID = SAMPLE_OWNER_ID;

let cachedWorld: WorldDocument | undefined;

/** The canonical demo `WorldDocument` (memoized — sample-world construction is pure but not free). */
export function getDemoWorldDocument(): WorldDocument {
  if (!cachedWorld) cachedWorld = createSampleWorld('NEON_TOKYO_2099');
  return cachedWorld;
}

export function getDemoWorldSummary(): World {
  const doc = getDemoWorldDocument();
  const now = new Date().toISOString();
  return {
    id: DEMO_WORLD_ID,
    ownerId: DEMO_OWNER_ID,
    name: doc.name,
    slug: 'neon-tokyo-2099',
    description: doc.description,
    genre: doc.genre,
    status: 'PUBLISHED',
    sizeKm2: doc.sizeKm2,
    maxPlayers: doc.maxPlayers,
    thumbnailUrl: null,
    currentVersionId: 'ver_demo_1',
    entityCount: doc.entities.length,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    publishedAt: now,
  };
}

export function getDemoGame(): Game {
  const doc = getDemoWorldDocument();
  return {
    id: DEMO_GAME_ID,
    worldId: DEMO_WORLD_ID,
    ownerId: DEMO_OWNER_ID,
    name: 'Neon Tokyo 2099: Rain Protocol',
    slug: 'neon-tokyo-2099-rain-protocol',
    description: doc.description,
    genre: doc.genre,
    engines: ['WEB'],
    status: 'PUBLISHED',
    maxPlayers: doc.maxPlayers,
    modes: ['STORY', 'FREE_ROAM'],
    thumbnailUrl: null,
    currentVersionId: 'ver_demo_1',
    playerCount: 1284,
    rating: 4.7,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** A second, lighter demo game so the "Games" rail doesn't look like a single-item list. */
export function getDemoGameSecondary(): Game {
  const now = new Date().toISOString();
  return {
    id: 'game_demo_skyline_drift',
    worldId: DEMO_WORLD_ID,
    ownerId: DEMO_OWNER_ID,
    name: 'Skyline Drift: Shibuya Fringe',
    slug: 'skyline-drift-shibuya-fringe',
    description: 'An autonomous-traffic racing spin-off set in the locked Shibuya Fringe district.',
    genre: ['RACING', 'CYBERPUNK'],
    engines: ['WEB', 'UNITY'],
    status: 'PUBLISHED',
    maxPlayers: 8,
    modes: ['TIME_TRIAL', 'PVP'],
    thumbnailUrl: null,
    currentVersionId: 'ver_demo_1',
    playerCount: 412,
    rating: 4.3,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDemoGames(): Game[] {
  return [getDemoGame(), getDemoGameSecondary()];
}

export function getDemoWorlds(): World[] {
  return [getDemoWorldSummary()];
}

export function getDemoMissions(): Mission[] {
  const missions = createNeonTokyoMissions();
  const now = new Date().toISOString();
  return missions.map((definition) => ({
    id: definition.id,
    worldId: DEMO_WORLD_ID,
    ownerId: DEMO_OWNER_ID,
    name: definition.name,
    definition,
    status: definition.state === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    createdAt: now,
    updatedAt: now,
  }));
}

export function getDemoActiveMission(): Mission | undefined {
  return getDemoMissions().find((m) => m.definition.state === 'ACTIVE');
}

export function getDemoNPCs(): NPC[] {
  const now = new Date().toISOString();
  return NEON_TOKYO_NPCS.map((definition) => ({
    id: definition.id,
    worldId: DEMO_WORLD_ID,
    ownerId: DEMO_OWNER_ID,
    name: definition.name,
    definition,
    agentId: definition.id,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  }));
}

export function getDemoCreators(): CreatorProfile[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'creator_kaito',
      userId: 'user_kaito',
      handle: 'kaito-forge',
      displayName: 'Kaito Forge',
      bio: 'Worldbuilder behind the Neon Tokyo saga. Cyberpunk districts, procedural neon, dense NPC factions.',
      avatarUrl: null,
      bannerUrl: null,
      website: null,
      socials: {},
      verified: true,
      followers: 18400,
      productCount: 12,
      createdAt: now,
    },
    {
      id: 'creator_yuki',
      userId: 'user_yuki',
      handle: 'yuki-relics',
      displayName: 'Yuki Relics',
      bio: 'Prop and relic packs, market stalls, and the Fantasy Merchant character line.',
      avatarUrl: null,
      bannerUrl: null,
      website: null,
      socials: {},
      verified: true,
      followers: 9120,
      productCount: 27,
      createdAt: now,
    },
    {
      id: 'creator_hoshino',
      userId: 'user_hoshino',
      handle: 'hoshino-labs',
      displayName: 'Hoshino Labs',
      bio: 'Vehicle systems and autonomous traffic AI for open-world city games.',
      avatarUrl: null,
      bannerUrl: null,
      website: null,
      socials: {},
      verified: false,
      followers: 3260,
      productCount: 6,
      createdAt: now,
    },
  ];
}

export interface CommunityLink {
  id: string;
  name: string;
  platform: 'DISCORD' | 'FORUM' | 'REDDIT' | 'EVENTS';
  description: string;
  members: number;
  url: string;
}

/**
 * Community hubs shown on the home page. `docs/CONTRACTS.md` §9 has no `communities` REST
 * surface — there is nowhere in the API to fetch these from — so this rail is presentation-only
 * demo content rather than something with an offline/online split. See this app's README
 * ("Cross-package notes") for the corresponding gap.
 */
export function getDemoCommunities(): CommunityLink[] {
  return [
    { id: 'community_neon_tokyo', name: 'Neon Tokyo Builders', platform: 'DISCORD', description: 'Creators and players trading tips on the Neon Tokyo 2099 world line.', members: 14200, url: 'https://discord.gg/example-neon-tokyo' },
    { id: 'community_worldforge', name: 'WorldForge Cartographers', platform: 'FORUM', description: 'Real-world-anchored worlds built with WorldForge — geo tricks, terrain, city packs.', members: 5300, url: 'https://forum.example.com/worldforge' },
    { id: 'community_ai_directors', name: 'AI Directors Guild', platform: 'REDDIT', description: 'Prompting patterns for the AI Director tool pipeline and NPC personalities.', members: 8760, url: 'https://reddit.com/r/example-ai-directors' },
    { id: 'community_live_ops', name: 'Live Events Crew', platform: 'EVENTS', description: 'Coordinating raids, seasons and drops across published games.', members: 2110, url: 'https://events.example.com/live-ops' },
  ];
}

/** A few live/upcoming events layered on top of the demo game, timed relative to "now" so the
 * countdown UI always has something interesting to show regardless of when this runs. */
export function getDemoLiveEvents(): LiveEvent[] {
  const now = Date.now();
  const hr = 3600_000;
  return [
    {
      id: 'event_rain_protocol_raid',
      gameId: DEMO_GAME_ID,
      worldId: DEMO_WORLD_ID,
      name: 'Tower Seven Raid Night',
      description: 'A synchronized server-wide push on the Kuro-Neko rooftop arena. Boss loot table doubled.',
      type: 'RAID',
      startsAt: new Date(now - 20 * 60_000).toISOString(),
      endsAt: new Date(now + 3 * hr).toISOString(),
      status: 'LIVE',
      participants: 642,
    },
    {
      id: 'event_neon_season_2',
      gameId: DEMO_GAME_ID,
      worldId: DEMO_WORLD_ID,
      name: 'Neon Season Two: Monsoon',
      description: 'A district-wide weather season with new storm cosmetics and the Golden Gai merchant rotation.',
      type: 'SEASON',
      startsAt: new Date(now + 6 * hr).toISOString(),
      endsAt: new Date(now + 30 * 24 * hr).toISOString(),
      status: 'SCHEDULED',
      participants: 0,
    },
    {
      id: 'event_skyline_drift_tourney',
      gameId: 'game_demo_skyline_drift',
      worldId: DEMO_WORLD_ID,
      name: 'Skyline Drift Tournament',
      description: 'Time-trial tournament through the Shibuya Fringe. Top 10 unlock the chrome livery.',
      type: 'TOURNAMENT',
      startsAt: new Date(now + 26 * hr).toISOString(),
      endsAt: new Date(now + 28 * hr).toISOString(),
      status: 'SCHEDULED',
      participants: 0,
    },
    {
      id: 'event_precinct_drop_ended',
      gameId: DEMO_GAME_ID,
      worldId: DEMO_WORLD_ID,
      name: 'Precinct Evidence Drop',
      description: 'A limited cosmetic drop tied to Detective Morgan\'s questline.',
      type: 'DROP',
      startsAt: new Date(now - 5 * 24 * hr).toISOString(),
      endsAt: new Date(now - 2 * hr).toISOString(),
      status: 'ENDED',
      participants: 3980,
    },
  ];
}

export function getDemoLeaderboard(): LeaderboardEntry[] {
  const now = new Date().toISOString();
  const names = ['Morgan_Sh', 'NightRunner', 'ChromeFox', 'KuroHunter77', 'RainSlicker', 'ByteGeisha', 'TokyoDrift_X', 'Pxl_Detective'];
  return names.map((handle, i) => ({
    rank: i + 1,
    playerId: `player_demo_${i + 1}`,
    handle,
    score: 98600 - i * 6400 - (i % 3) * 900,
    achievedAt: now,
  }));
}

export const DEMO_PLAYER_SPAWN_KEY = NEON_TOKYO_ENTITY_KEYS.playerSpawn;

/** Demo "Purchases" for the Profile page's library tab. */
export function getDemoLibrary(): LibraryItem[] {
  const now = new Date().toISOString();
  const creators = getDemoCreators();
  const kaito = creators[0]!;
  const yuki = creators[1]!;
  return [
    {
      id: 'lib_neon_tokyo_2099',
      productId: 'prod_neon_tokyo_2099',
      product: {
        id: 'prod_neon_tokyo_2099', slug: 'neon-tokyo-2099', name: 'Neon Tokyo 2099', category: 'WORLD',
        genre: ['CYBERPUNK', 'OPEN_WORLD'], engines: ['WEB'], priceCents: 2900, currency: 'USD', thumbnailUrl: null,
        rating: 4.8, ratingCount: 512, sales: 9800,
        creator: { id: kaito.id, handle: kaito.handle, displayName: kaito.displayName, avatarUrl: kaito.avatarUrl, verified: kaito.verified },
        licenseSummary: { commercial: true, multiplayer: true, attribution: false },
        status: 'PUBLISHED', featured: true, publishedAt: now,
      },
      orderId: 'order_demo_1',
      licenseId: 'lic_neon_tokyo_2099',
      acquiredAt: now,
    },
    {
      id: 'lib_fantasy_merchant_pack',
      productId: 'prod_fantasy_merchant_pack',
      product: {
        id: 'prod_fantasy_merchant_pack', slug: 'fantasy-merchant-relic-pack', name: 'Fantasy Merchant Relic Pack', category: 'CHARACTER',
        genre: ['FANTASY'], engines: ['WEB', 'UNITY'], priceCents: 900, currency: 'USD', thumbnailUrl: null,
        rating: 4.5, ratingCount: 88, sales: 2100,
        creator: { id: yuki.id, handle: yuki.handle, displayName: yuki.displayName, avatarUrl: yuki.avatarUrl, verified: yuki.verified },
        licenseSummary: { commercial: true, multiplayer: true, attribution: true },
        status: 'PUBLISHED', featured: false, publishedAt: now,
      },
      orderId: 'order_demo_2',
      licenseId: 'lic_fantasy_merchant_pack',
      acquiredAt: now,
    },
  ];
}
