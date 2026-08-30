import type { ToolCall } from '@sonic-gameworld/world-schema';

/** Optional context to resolve pronouns/implicit targets ("this area", "it") in a command. */
export interface ParseContext {
  /** Entity name/id to use for "this area"/"it"/unqualified targets. */
  anchorName?: string;
  /** World name, used to give generated names a bit of flavor. */
  worldName?: string;
}

const WEATHER_WORDS: Record<string, string> = {
  storm: 'STORM', storms: 'STORM',
  rain: 'RAIN', raining: 'RAIN',
  snow: 'SNOW', snowing: 'SNOW',
  fog: 'FOG', foggy: 'FOG',
  sandstorm: 'SANDSTORM',
  clouds: 'CLOUDS', cloudy: 'CLOUDS',
  clear: 'CLEAR',
};

const TIME_WORDS: Record<string, number> = {
  night: 22, midnight: 0, dawn: 6, sunrise: 6.5, morning: 8,
  noon: 12, midday: 12, afternoon: 15, dusk: 19, sunset: 19.5, evening: 20,
};

const PLACEMENT_WORDS: Record<string, string> = {
  near: 'NEAR', behind: 'BEHIND', 'in front of': 'IN_FRONT', inside: 'INSIDE',
  at: 'AT', around: 'AROUND', above: 'ABOVE', left: 'LEFT', right: 'RIGHT',
};

const ARCHETYPE_WORDS: Record<string, string> = {
  enemy: 'enemy', enemies: 'enemy',
  npc: 'npc', npcs: 'npc',
  guard: 'guard', guards: 'guard',
  zombie: 'zombie', zombies: 'zombie',
  civilian: 'civilian', civilians: 'civilian',
  police: 'police',
  gang: 'gang_member', gangs: 'gang_member',
  vehicle: 'autonomous_vehicle', vehicles: 'autonomous_vehicle',
  'autonomous vehicle': 'autonomous_vehicle', 'autonomous vehicles': 'autonomous_vehicle',
};

function toolCall(tool: ToolCall['tool'], args: Record<string, unknown>): ToolCall {
  return { tool, args };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Splits "civilians, police, gangs and autonomous vehicles" into ['civilians','police','gangs','autonomous vehicles']. */
function splitList(text: string): string[] {
  return text
    .split(/,|\band\b/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

function archetypeFor(word: string): string {
  const normalized = word.trim().toLowerCase();
  return ARCHETYPE_WORDS[normalized] ?? normalized.replace(/\s+/g, '_');
}

/**
 * Deterministically parse simple English world-director commands into AI tool-call plans,
 * mirroring the `mock` AIProvider described in docs/CONTRACTS.md §8. No network/model calls —
 * pure pattern matching, so the whole stack (and this parser) works with no API key.
 */
export function parseCommandMock(text: string, ctx: ParseContext = {}): ToolCall[] {
  const raw = text.trim();
  const t = raw.toLowerCase();
  const anchor = ctx.anchorName ?? 'this area';

  // "publish it"
  if (/^publish\b/.test(t) || /\bpublish\s+(it|this|the world)\b/.test(t)) {
    return [toolCall('publish_asset', { target: 'WORLD', visibility: 'PUBLIC' })];
  }

  // "make it an extraction game"
  if (/\bextraction game\b/.test(t) || /\bmake it an extraction\b/.test(t)) {
    return [
      toolCall('create_quest', {
        name: 'Extraction',
        description: 'Reach the objective, secure the item and extract before time runs out.',
        objectiveType: 'COLLECT',
        difficulty: 6,
        rewards: [{ type: 'CURRENCY', amount: 1000 }],
      }),
      toolCall('create_trigger', {
        name: 'Extraction Zone',
        kind: 'EXIT_VOLUME',
        entity: anchor,
        params: { role: 'extraction_point' },
        actions: [],
      }),
    ];
  }

  // "make this area a boss arena"
  if (/\bboss arena\b/.test(t)) {
    const target = /\b(this area|it)\b/.test(t) ? anchor : t.replace(/^make\s+/, '').replace(/\s+a boss arena.*$/, '').trim() || anchor;
    return [
      toolCall('create_trigger', {
        name: 'Boss Arena Trigger',
        kind: 'ENTER_VOLUME',
        entity: target,
        params: { role: 'boss_arena' },
        actions: [
          { tool: 'set_weather', args: { weather: 'STORM', intensity: 1 } },
          { tool: 'spawn_npc', args: { archetype: 'boss', count: 1, placement: { relation: 'INSIDE', anchor: target } } },
        ],
      }),
      toolCall('modify_entity', {
        entityName: target,
        patch: { tags: ['boss-arena'], metadata: { threat: 'extreme' } },
      }),
    ];
  }

  // "create a zombie outbreak in <place>"
  const outbreak = t.match(/zombie outbreak(?:\s+in\s+(.+))?/);
  if (outbreak) {
    const place = outbreak[1]?.trim();
    const placement = place ? { relation: 'AROUND', anchor: place, radiusM: 60 } : { relation: 'AROUND', radiusM: 60 };
    return [
      toolCall('spawn_npc', { archetype: 'zombie', count: 12, faction: 'infected', aggression: 0.9, placement }),
      toolCall('spawn_npc', { archetype: 'zombie', count: 6, faction: 'infected', aggression: 0.9, placement: { ...placement, relation: 'NEAR' } }),
      toolCall('set_weather', { weather: 'FOG', intensity: 0.7 }),
      toolCall('create_trigger', {
        name: 'Outbreak Zone',
        kind: 'EVENT',
        event: 'outbreak.started',
        entity: place,
        params: { severity: 'high' },
        actions: [],
      }),
    ];
  }

  // "add civilians, police, gangs and autonomous vehicles"
  const addMatch = t.match(/^add\s+(.+)$/);
  if (addMatch && /,|\band\b/.test(addMatch[1] ?? '')) {
    const factions = splitList(addMatch[1] ?? '');
    if (factions.length > 1) {
      return factions.map((faction) =>
        toolCall('spawn_npc', {
          archetype: archetypeFor(faction),
          count: 6,
          faction: archetypeFor(faction),
          placement: { relation: 'AROUND', anchor, radiusM: 80 },
        }),
      );
    }
  }

  // "spawn N enemies|npcs|guards|zombies near/behind/... <entity name>"
  const spawn = t.match(
    /spawn\s+(\d+)\s+([a-z_]+)\s+(near|behind|in front of|inside|at|around|above|left|right)\s+(?:the\s+)?(.+)/,
  );
  if (spawn) {
    const [, countStr, archetypeWord, relationWord, target] = spawn;
    return [
      toolCall('spawn_npc', {
        archetype: archetypeFor(archetypeWord ?? 'npc'),
        count: Number(countStr),
        placement: {
          relation: PLACEMENT_WORDS[relationWord ?? 'near'] ?? 'NEAR',
          anchor: target?.trim(),
        },
      }),
    ];
  }

  // "follow player N"
  const followPlayer = t.match(/follow\s+player\s+(\d+)/);
  if (followPlayer) {
    return [toolCall('track_entity', { entity: `Player ${followPlayer[1]}`, cameraMode: 'FOLLOW' })];
  }

  // "track <name>"
  const track = t.match(/^track\s+(.+)$/);
  if (track) {
    return [toolCall('track_entity', { entity: titleCase((track[1] ?? '').trim()), cameraMode: 'FOLLOW' })];
  }

  // "start the storm|rain|snow|fog|..."
  const weather = t.match(/start\s+the\s+([a-z]+)/);
  if (weather && WEATHER_WORDS[weather[1] ?? '']) {
    return [toolCall('set_weather', { weather: WEATHER_WORDS[weather[1] ?? ''], intensity: 0.8 })];
  }

  // "set time to <n>|night|dawn|noon|..."
  const time = t.match(/set\s+time\s+to\s+([a-z0-9.]+)/);
  if (time) {
    const word = time[1] ?? '';
    const hour = TIME_WORDS[word] ?? Number.parseFloat(word);
    if (!Number.isNaN(hour)) {
      return [toolCall('set_time_of_day', { hour })];
    }
  }

  // "create a cinematic shot of <x>"
  const cinematic = t.match(/create\s+a\s+cinematic\s+shot\s+of\s+(.+)/);
  if (cinematic) {
    const subject = (cinematic[1] ?? '').trim();
    return [
      toolCall('create_cinematic', {
        name: `Cinematic of ${titleCase(subject)}`,
        subject,
        shots: [
          { mode: 'DRONE', durationS: 4, transition: 'FADE', targetEntity: subject },
          { mode: 'ORBIT', durationS: 6, transition: 'CUT', targetEntity: subject },
        ],
      }),
    ];
  }

  return [];
}
