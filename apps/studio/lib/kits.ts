import { createEmptyWorld, randomUuid, transformAt, SAMPLE_OWNER_ID, type Genre, type MissionDefinition, type WorldDocument, type WorldEntity } from '@sonic-gameworld/world-schema';

export interface GameKit {
  id: string;
  name: string;
  description: string;
  genre: Genre[];
  tags: string[];
  sizeKm2: number;
  maxPlayers: number;
}

export const GAME_KITS: GameKit[] = [
  {
    id: 'extraction-shooter-starter',
    name: 'Extraction Shooter Starter',
    description: 'A compact PvPvE extraction map with a landing zone, loot buildings, and a helicopter extraction point.',
    genre: ['SHOOTER', 'TACTICAL'],
    tags: ['pvp', 'pve', 'loot'],
    sizeKm2: 3,
    maxPlayers: 24,
  },
  {
    id: 'open-world-rpg-starter',
    name: 'Open World RPG Starter',
    description: 'A town hub, surrounding wilderness zone, and a starter quest chain ready to extend.',
    genre: ['RPG', 'FANTASY'],
    tags: ['quests', 'npcs', 'exploration'],
    sizeKm2: 9,
    maxPlayers: 64,
  },
  {
    id: 'battle-royale-arena',
    name: 'Battle Royale Arena',
    description: 'A large ring-fenced arena with a shrinking storm volume and scattered supply drops.',
    genre: ['SHOOTER', 'SURVIVAL'],
    tags: ['battle-royale', 'storm', 'drops'],
    sizeKm2: 16,
    maxPlayers: 100,
  },
  {
    id: 'tower-defense-kit',
    name: 'Tower Defense Kit',
    description: 'A single lane approach with build volumes and a core to defend against scripted waves.',
    genre: ['STRATEGY'],
    tags: ['waves', 'defense', 'pve'],
    sizeKm2: 1,
    maxPlayers: 4,
  },
  {
    id: 'racing-circuit-kit',
    name: 'Racing Circuit Kit',
    description: 'A closed racing circuit with checkpoints, a pit lane, and vehicle spawn grid.',
    genre: ['RACING'],
    tags: ['vehicles', 'checkpoints'],
    sizeKm2: 5,
    maxPlayers: 20,
  },
];

export function getKit(id: string): GameKit | undefined {
  return GAME_KITS.find((k) => k.id === id);
}

/** Offline stand-in for `POST /v1/worlds` with `{ template: kit.id }` — seeds a starter layout locally. */
export function instantiateKitLocally(kit: GameKit): WorldDocument {
  const doc = createEmptyWorld({
    id: randomUuid(),
    ownerId: SAMPLE_OWNER_ID,
    name: kit.name,
    description: kit.description,
    genre: kit.genre,
    sizeKm2: kit.sizeKm2,
    maxPlayers: kit.maxPlayers,
  });

  const entities: WorldEntity[] = [
    {
      id: randomUuid(),
      kind: 'PLAYER_SPAWN',
      name: 'Landing Zone',
      transform: transformAt(0, 0, 0, 1),
      tags: [kit.id, 'kit'],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
      metadata: {},
    },
    {
      id: randomUuid(),
      kind: 'BUILDING',
      name: 'Kit Structure',
      transform: transformAt(20, 0, 10, 2),
      tags: [kit.id, 'kit'],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
      metadata: {},
    },
    {
      id: randomUuid(),
      kind: 'VOLUME',
      name: kit.id === 'battle-royale-arena' ? 'Storm Boundary' : kit.id === 'tower-defense-kit' ? 'Build Zone' : 'Objective Volume',
      transform: transformAt(0, 0, 0, kit.sizeKm2 > 5 ? 400 : 80),
      tags: [kit.id, 'kit'],
      permissions: { ownerId: SAMPLE_OWNER_ID, editors: [], visibility: 'PUBLIC' },
      metadata: {},
    },
  ];

  const missions: MissionDefinition[] = [
    {
      id: randomUuid(),
      name: `${kit.name}: Getting Started`,
      description: `A starter objective included with the ${kit.name} kit.`,
      order: 0,
      objectives: [{ id: randomUuid(), type: 'REACH', description: 'Reach the marked objective volume.', conditions: [] }],
      triggers: [],
      rewards: [{ type: 'XP', amount: 50 }],
      difficulty: 2,
      state: 'DRAFT',
    },
  ];

  return { ...doc, entities: [...doc.entities, ...entities], missions: [...doc.missions, ...missions] };
}
