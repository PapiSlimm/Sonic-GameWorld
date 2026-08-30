// `POST /ai/generate` (CONTRACTS.md §8/§9): "world spec / npc / mission / cinematic generation
// returning world-schema objects; the mock provider generates deterministic rich outputs from the
// prompt, e.g. 'Build me a 10 km cyberpunk city with four districts, underground tunnels, a
// spaceport and a central corporate tower' yields 4 REGION entities, tunnels as VOLUME, a
// spaceport ZONE, a tower BUILDING, plus roads/props."
//
// Generation is deterministic pattern-matching over the prompt (mirroring the `mock` AIProvider's
// philosophy: the whole stack works with no API key) rather than a second LLM round-trip — a real
// provider's *narration* is still layered on top by the route handler when one is configured, but
// the structural result (which entities/fields get created) is always reproducible. Every mutation
// this module makes to a real world still goes through `executeToolPlan` (permission -> validate
// -> execute -> AIExecution/event audit trail), same as `POST /ai/command` — "AI never mutates
// state directly" applies here too.
import type { FastifyInstance } from 'fastify';
import {
  randomUuid,
  transformAt,
  type AIAgentRole,
  type Genre,
  type NPCDefinition,
  type ToolCall,
  type WorldDocument,
} from '@sonic-gameworld/world-schema';
import type { AuthContext } from '../../types.js';
import { AppError } from '../../errors.js';
import { executeToolPlan, type DeniedToolCall, type ExecutedToolCall } from './pipeline.js';
import { assertWorldAccess, getWorldDocument, type WorldRecord } from './worldStore.js';

// ---------------------------------------------------------------------------------------------
// Shared parsing helpers
// ---------------------------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function parseCount(word: string | undefined, fallback: number): number {
  if (!word) return fallback;
  const n = Number(word);
  if (!Number.isNaN(n)) return n;
  return NUMBER_WORDS[word.toLowerCase()] ?? fallback;
}

function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const THEME_GENRE: [RegExp, Genre][] = [
  [/cyberpunk/, 'CYBERPUNK'],
  [/fantasy|medieval|kingdom/, 'FANTASY'],
  [/sci-?fi|science fiction/, 'SCIFI'],
  [/horror|zombie|infected/, 'HORROR'],
  [/racing|race track|speedway/, 'RACING'],
  [/survival/, 'SURVIVAL'],
  [/\brpg\b/, 'RPG'],
  [/\bmmo\b/, 'MMO'],
  [/tactical/, 'TACTICAL'],
  [/strategy/, 'STRATEGY'],
  [/shooter|combat arena/, 'SHOOTER'],
  [/open[- ]world/, 'OPEN_WORLD'],
];

function inferGenres(text: string): Genre[] {
  const found = THEME_GENRE.filter(([re]) => re.test(text)).map(([, g]) => g);
  return found.length > 0 ? Array.from(new Set(found)) : ['OTHER'];
}

// ---------------------------------------------------------------------------------------------
// WORLD generation
// ---------------------------------------------------------------------------------------------

export interface GeneratedWorldEntityPlan {
  kind: 'REGION' | 'ZONE' | 'BUILDING' | 'VOLUME' | 'ROAD' | 'PROP';
  name: string;
  count: number;
}

export interface WorldGenerationPlan {
  name: string;
  description: string;
  genre: Genre[];
  sizeKm2: number;
  entities: GeneratedWorldEntityPlan[];
}

/** Deterministically parse a world-generation prompt into a structured plan. Exported for unit
 * testing independent of a live world/database. */
export function planWorldFromPrompt(prompt: string): WorldGenerationPlan {
  const t = prompt.toLowerCase();

  const sizeMatch = t.match(/(\d+(?:\.\d+)?)\s*km/);
  const sideKm = sizeMatch?.[1] ? Number(sizeMatch[1]) : 4;
  const sizeKm2 = Math.round(sideKm * sideKm * 100) / 100;

  const districtMatch = t.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(districts?|regions?|zones?)/);
  const districtCount = districtMatch ? parseCount(districtMatch[1], 4) : 0;

  const entities: GeneratedWorldEntityPlan[] = [];
  if (districtCount > 0) entities.push({ kind: 'REGION', name: 'District', count: districtCount });
  if (/tunnel/.test(t)) entities.push({ kind: 'VOLUME', name: 'Underground Tunnel', count: 1 });
  if (/spaceport|starport/.test(t)) entities.push({ kind: 'ZONE', name: 'Spaceport', count: 1 });
  if (/(corporate\s+)?tower|skyscraper|citadel|castle keep/.test(t)) entities.push({ kind: 'BUILDING', name: /castle/.test(t) ? 'Castle Keep' : 'Corporate Tower', count: 1 });
  if (entities.length > 0 || /city|town|district/.test(t)) {
    entities.push({ kind: 'ROAD', name: 'Main Road', count: Math.max(1, districtCount) });
    entities.push({ kind: 'PROP', name: 'Street Prop', count: Math.max(6, districtCount * 3) });
  }

  const name = titleCase(prompt.replace(/^(build|create|generate)\s+(me\s+)?/i, '').slice(0, 60)) || 'Generated World';

  return { name, description: prompt, genre: inferGenres(t), sizeKm2, entities };
}

/** Lay out a generated entity plan's instances deterministically within a world of the given
 * half-extent (meters): districts in a ring, a tunnel below-ground at the center, the spaceport at
 * the eastern edge, the tower at the exact center, roads spoking out to each district, and props
 * scattered on a small fixed grid — no RNG, so results are reproducible. */
function placeEntity(kind: GeneratedWorldEntityPlan['kind'], index: number, count: number, halfExtentM: number) {
  const ring = Math.max(50, halfExtentM * 0.6);
  switch (kind) {
    case 'REGION': {
      const angle = (2 * Math.PI * index) / Math.max(1, count);
      return transformAt(Math.cos(angle) * ring, 0, Math.sin(angle) * ring, ring * 0.4);
    }
    case 'VOLUME':
      return transformAt(0, -40, 0, halfExtentM * 0.5);
    case 'ZONE':
      return transformAt(halfExtentM * 0.7, 0, 0, halfExtentM * 0.25);
    case 'BUILDING':
      return transformAt(0, 0, 0, 20);
    case 'ROAD': {
      const angle = (2 * Math.PI * index) / Math.max(1, count);
      return transformAt(Math.cos(angle) * ring * 0.5, 0, Math.sin(angle) * ring * 0.5, 1);
    }
    case 'PROP':
    default: {
      const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
      const spacing = Math.max(10, halfExtentM / (cols + 1));
      const row = Math.floor(index / cols);
      const col = index % cols;
      return transformAt((col - cols / 2) * spacing, 0, (row - cols / 2) * spacing, 1);
    }
  }
}

function worldGenerationToolCalls(plan: WorldGenerationPlan, halfExtentM: number): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const spec of plan.entities) {
    for (let i = 0; i < spec.count; i++) {
      const transform = placeEntity(spec.kind, i, spec.count, halfExtentM);
      calls.push({
        tool: 'create_entity',
        args: {
          kind: spec.kind,
          name: spec.count > 1 ? `${spec.name} ${i + 1}` : spec.name,
          transform,
          tags: ['ai-generated'],
          metadata: { generated: true, source: 'ai.generate' },
        },
      });
    }
  }
  return calls;
}

export interface GenerateWorldResult {
  kind: 'WORLD';
  worldId: string;
  plan: WorldGenerationPlan;
  document: WorldDocument;
  executed: ExecutedToolCall[];
  denied: DeniedToolCall[];
}

export async function generateWorld(
  app: FastifyInstance,
  user: AuthContext,
  input: { prompt: string; worldId?: string },
): Promise<GenerateWorldResult> {
  const plan = planWorldFromPrompt(input.prompt);
  const role: AIAgentRole = 'BUILDER';

  let world: WorldRecord;
  let doc: WorldDocument;

  if (input.worldId) {
    const loaded = await getWorldDocument(app, input.worldId);
    assertWorldAccess(loaded.world, user);
    world = loaded.world;
    doc = loaded.doc;
  } else {
    const createRun = await executeToolPlan(app, user, null, null, role, [
      { tool: 'create_world', args: { name: plan.name, description: plan.description, genre: plan.genre, sizeKm2: plan.sizeKm2 } },
    ]);
    const created = createRun.executed[0];
    if (!created?.ok || !created.result) {
      const reason = createRun.denied[0]?.reason ?? created?.error ?? 'create_world did not return a result';
      throw AppError.internal(`World generation failed: ${reason}`);
    }
    const worldId = (created.result as { worldId: string }).worldId;
    const loaded = await getWorldDocument(app, worldId);
    world = loaded.world;
    doc = loaded.doc;
  }

  const halfExtentM = Math.max(50, (doc.bounds.max.x - doc.bounds.min.x) / 2);
  const toolCalls = worldGenerationToolCalls(plan, halfExtentM);
  const run = toolCalls.length > 0 ? await executeToolPlan(app, user, world, doc, role, toolCalls) : { doc, executed: [], denied: [] };

  return { kind: 'WORLD', worldId: world.id, plan, document: run.doc, executed: run.executed, denied: run.denied };
}

// ---------------------------------------------------------------------------------------------
// NPC generation
// ---------------------------------------------------------------------------------------------

const TRAIT_WORDS: Record<string, string> = {
  aggressive: 'aggressive', hostile: 'aggressive', brutal: 'aggressive',
  friendly: 'friendly', kind: 'friendly', helpful: 'friendly',
  wise: 'wise', ancient: 'wise', scholarly: 'wise',
  brave: 'brave', fearless: 'brave', heroic: 'brave',
  cowardly: 'cowardly', timid: 'cowardly',
  mysterious: 'mysterious', secretive: 'mysterious', cryptic: 'mysterious',
  greedy: 'greedy', mercenary: 'greedy',
  loyal: 'loyal', devoted: 'loyal',
  cunning: 'cunning', sly: 'cunning', deceptive: 'cunning',
};

export interface GenerateNpcResult {
  kind: 'NPC';
  npc: NPCDefinition;
  spawn?: { entityId: string; entityName: string };
  denied: DeniedToolCall[];
}

export function planNpcFromPrompt(prompt: string): NPCDefinition {
  const t = prompt.toLowerCase();
  const traits = Object.entries(TRAIT_WORDS)
    .filter(([word]) => t.includes(word))
    .map(([, trait]) => trait)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const aggression = traits.includes('aggressive') ? 0.8 : traits.includes('cowardly') ? 0.1 : 0.3;
  const nameMatch = prompt.match(/(?:named|called)\s+([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*)/);
  const name = nameMatch?.[1] ?? titleCase(prompt.split(/[.,]/)[0]?.slice(0, 40) ?? 'Generated NPC') ?? 'Generated NPC';

  return {
    id: randomUuid(),
    name,
    personality: { traits: traits.length > 0 ? traits : ['neutral'], backstory: prompt, goals: [], tone: traits.includes('mysterious') ? 'cryptic' : 'conversational' },
    memory: { enabled: true, capacity: 200 },
    knowledge: { kbIds: [] },
    behavior: { states: ['IDLE'], aggression, faction: undefined },
    dialogue: { style: 'conversational', openingLines: [] },
    relationships: [],
  };
}

export async function generateNpc(app: FastifyInstance, user: AuthContext, input: { prompt: string; worldId?: string }): Promise<GenerateNpcResult> {
  const npc = planNpcFromPrompt(input.prompt);
  if (!input.worldId) return { kind: 'NPC', npc, denied: [] };

  const { world, doc } = await getWorldDocument(app, input.worldId);
  assertWorldAccess(world, user);
  const run = await executeToolPlan(app, user, world, doc, 'NPC', [
    { tool: 'spawn_npc', args: { archetype: npc.name, count: 1, faction: npc.behavior.faction, aggression: npc.behavior.aggression } },
  ]);
  const spawnExec = run.executed[0];
  const spawned = spawnExec?.ok ? (spawnExec.result as { entities?: { id: string; name: string }[] }) : undefined;
  const entity = spawned?.entities?.[0];
  return { kind: 'NPC', npc, spawn: entity ? { entityId: entity.id, entityName: entity.name } : undefined, denied: run.denied };
}

// ---------------------------------------------------------------------------------------------
// Mission generation
// ---------------------------------------------------------------------------------------------

const OBJECTIVE_WORDS: [RegExp, string][] = [
  [/\bkill|eliminate|destroy|defeat\b/, 'KILL'],
  [/\bcollect|retrieve|gather|find\b/, 'COLLECT'],
  [/\bescort|protect and move|guide\b/, 'ESCORT'],
  [/\bdefend|hold the line|survive waves\b/, 'DEFEND'],
  [/\breach|arrive at|get to\b/, 'REACH'],
  [/\bsurvive\b/, 'SURVIVE'],
  [/\btalk to|interact with|investigate\b/, 'INTERACT'],
];

export interface MissionGenerationPlan {
  name: string;
  description: string;
  objectiveType: 'REACH' | 'KILL' | 'COLLECT' | 'ESCORT' | 'DEFEND' | 'INTERACT' | 'SURVIVE' | 'CUSTOM';
  difficulty: number;
}

export function planMissionFromPrompt(prompt: string): MissionGenerationPlan {
  const t = prompt.toLowerCase();
  const objectiveType = (OBJECTIVE_WORDS.find(([re]) => re.test(t))?.[1] ?? 'CUSTOM') as MissionGenerationPlan['objectiveType'];
  let difficulty = 5;
  if (/\bboss\b/.test(t)) difficulty = 9;
  else if (/\beasy\b/.test(t)) difficulty = 2;
  else if (/\bhard|brutal|deadly\b/.test(t)) difficulty = 8;
  const name = titleCase(prompt.replace(/^(create|design|generate)\s+(a\s+)?(mission|quest)\s*(to|for|:)?\s*/i, '').slice(0, 60)) || 'Generated Mission';
  return { name, description: prompt, objectiveType, difficulty };
}

export interface GenerateMissionResult {
  kind: 'MISSION';
  plan: MissionGenerationPlan;
  mission?: unknown;
  denied: DeniedToolCall[];
}

export async function generateMission(app: FastifyInstance, user: AuthContext, input: { prompt: string; worldId?: string }): Promise<GenerateMissionResult> {
  const plan = planMissionFromPrompt(input.prompt);
  if (!input.worldId) return { kind: 'MISSION', plan, denied: [] };

  const { world, doc } = await getWorldDocument(app, input.worldId);
  assertWorldAccess(world, user);
  const run = await executeToolPlan(app, user, world, doc, 'QUESTMASTER', [
    { tool: 'create_quest', args: { name: plan.name, description: plan.description, objectiveType: plan.objectiveType, difficulty: plan.difficulty } },
  ]);
  const questExec = run.executed[0];
  const mission = questExec?.ok ? (questExec.result as { mission?: unknown }).mission : undefined;
  return { kind: 'MISSION', plan, mission, denied: run.denied };
}

// ---------------------------------------------------------------------------------------------
// Cinematic generation
// ---------------------------------------------------------------------------------------------

const SHOT_MODE_WORDS: [RegExp, string][] = [
  [/orbit/, 'ORBIT'],
  [/drone|aerial|flyover/, 'DRONE'],
  [/chase/, 'CHASE'],
  [/crane/, 'CRANE'],
  [/rail|dolly/, 'RAIL'],
  [/first[- ]person/, 'FIRST_PERSON'],
  [/third[- ]person/, 'THIRD_PERSON'],
  [/follow/, 'FOLLOW'],
];

export interface CinematicGenerationPlan {
  name: string;
  subject?: string;
  shots: { mode: string; durationS: number; transition: 'CUT' | 'FADE' | 'DISSOLVE' | 'WIPE' }[];
}

export function planCinematicFromPrompt(prompt: string): CinematicGenerationPlan {
  const t = prompt.toLowerCase();
  const subjectMatch = prompt.match(/\bof\s+(.+)$/i);
  const subject = subjectMatch?.[1]?.trim();
  const modes = SHOT_MODE_WORDS.filter(([re]) => re.test(t)).map(([, m]) => m);
  const shots = (modes.length > 0 ? modes : ['DRONE', 'ORBIT']).map((mode, i) => ({
    mode,
    durationS: 4,
    transition: (i === 0 ? 'FADE' : 'CUT') as 'CUT' | 'FADE',
  }));
  const name = titleCase(`Cinematic${subject ? ` of ${subject}` : ''}`);
  return { name, subject, shots };
}

export interface GenerateCinematicResult {
  kind: 'CINEMATIC';
  plan: CinematicGenerationPlan;
  sequence?: unknown;
  denied: DeniedToolCall[];
}

export async function generateCinematic(app: FastifyInstance, user: AuthContext, input: { prompt: string; worldId?: string }): Promise<GenerateCinematicResult> {
  const plan = planCinematicFromPrompt(input.prompt);
  if (!input.worldId) return { kind: 'CINEMATIC', plan, denied: [] };

  const { world, doc } = await getWorldDocument(app, input.worldId);
  assertWorldAccess(world, user);
  const run = await executeToolPlan(app, user, world, doc, 'CINEMATOGRAPHER', [
    { tool: 'create_cinematic', args: { name: plan.name, subject: plan.subject, shots: plan.shots } },
  ]);
  const cinematicExec = run.executed[0];
  const sequence = cinematicExec?.ok ? (cinematicExec.result as { sequence?: unknown }).sequence : undefined;
  return { kind: 'CINEMATIC', plan, sequence, denied: run.denied };
}
