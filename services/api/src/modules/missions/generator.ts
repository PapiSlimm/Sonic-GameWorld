// Deterministic questmaster generator (§9: `POST /missions/generate`). Turns a world's current
// entities + a free-text prompt into a valid `MissionDefinition` (objectives/triggers/rewards) —
// no external AI call required. Picking real entities out of the world (rather than inventing
// ids) is what keeps the produced document schema-valid against `validateWorld`'s dangling-
// reference checks if it's ever spliced into a `WorldDocument.missions` array later.
import { randomUUID } from 'node:crypto';
import {
  ConditionSchema,
  MissionDefinitionSchema,
  ObjectiveTypeSchema,
  RewardSchema,
  ToolCallSchema,
  TriggerKindSchema,
  type MissionDefinition,
  type Objective,
  type ObjectiveType,
  type Reward,
  type Trigger,
  type WorldDocument,
  type WorldEntity,
} from '@sonic-gameworld/world-schema';
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (same small mulberry32 approach as worlds/forge.ts and npcs/generator.ts).
// ---------------------------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Re-export the request-body building blocks so ./index.ts's zod schemas stay in lockstep with
// world-schema's own Objective/Trigger/Reward shapes instead of redeclaring the unions.
export { ConditionSchema, ObjectiveTypeSchema, RewardSchema, ToolCallSchema, TriggerKindSchema };

const OBJECTIVE_KEYWORDS: { words: string[]; type: ObjectiveType }[] = [
  { words: ['kill', 'defeat', 'destroy', 'eliminate', 'hunt', 'slay'], type: 'KILL' },
  { words: ['collect', 'gather', 'retrieve', 'recover', 'loot'], type: 'COLLECT' },
  { words: ['escort', 'guide', 'accompany'], type: 'ESCORT' },
  { words: ['defend', 'hold the line', 'guard', 'protect'], type: 'DEFEND' },
  { words: ['reach', 'travel', 'explore', 'scout', 'find the'], type: 'REACH' },
  { words: ['talk', 'investigate', 'interact', 'inspect', 'search'], type: 'INTERACT' },
  { words: ['survive', 'endure', 'last'], type: 'SURVIVE' },
];
const OBJECTIVE_TYPES: ObjectiveType[] = ['REACH', 'KILL', 'COLLECT', 'ESCORT', 'DEFEND', 'INTERACT', 'SURVIVE'];

function pickObjectiveType(prompt: string, rand: () => number): ObjectiveType {
  const lower = prompt.toLowerCase();
  const matched = OBJECTIVE_KEYWORDS.find((k) => k.words.some((w) => lower.includes(w)));
  if (matched) return matched.type;
  return OBJECTIVE_TYPES[Math.floor(rand() * OBJECTIVE_TYPES.length)] ?? 'REACH';
}

function candidatesFor(doc: WorldDocument, type: ObjectiveType): WorldEntity[] {
  switch (type) {
    case 'KILL':
      return doc.entities.filter((e) => e.kind === 'NPC' && (e.tags.includes('enemy') || e.tags.includes('hostile') || e.tags.includes('infected')));
    case 'ESCORT':
    case 'DEFEND':
      return doc.entities.filter((e) => e.kind === 'NPC' && !e.tags.includes('enemy') && !e.tags.includes('hostile'));
    case 'COLLECT':
      return doc.entities.filter((e) => e.kind === 'ITEM' || e.kind === 'PROP');
    case 'REACH':
      return doc.entities.filter((e) => e.kind === 'BUILDING' || e.kind === 'REGION' || e.kind === 'ZONE' || e.kind === 'VOLUME');
    case 'INTERACT':
      return doc.entities.filter((e) => e.kind === 'TRIGGER' || e.kind === 'PROP' || e.kind === 'NPC');
    case 'SURVIVE':
    default:
      return [];
  }
}

function describeObjective(type: ObjectiveType, target: WorldEntity | undefined, count: number | undefined): string {
  const who = target ? target.name : type === 'KILL' ? 'the hostiles' : type === 'COLLECT' ? 'the scattered supplies' : 'the objective';
  switch (type) {
    case 'KILL':
      return `Defeat ${count ?? 1} ${count && count > 1 ? 'enemies near' : 'enemy near'} ${who}.`;
    case 'COLLECT':
      return `Collect ${count ?? 1} item${count && count > 1 ? 's' : ''} (${who}).`;
    case 'ESCORT':
      return `Escort ${who} safely to their destination.`;
    case 'DEFEND':
      return `Defend ${who} until the threat passes.`;
    case 'REACH':
      return `Reach ${who}.`;
    case 'INTERACT':
      return `Investigate ${who}.`;
    case 'SURVIVE':
      return 'Survive the encounter.';
    default:
      return `Complete the objective at ${who}.`;
  }
}

const NAME_VERBS: Record<ObjectiveType, string[]> = {
  KILL: ['The Cull of', 'Cleansing', 'Hunt at'],
  COLLECT: ['Scavenge at', 'The Gathering of', 'Salvage Run:'],
  ESCORT: ['Safe Passage:', 'Escort to'],
  DEFEND: ['Hold the Line:', 'Last Stand at'],
  REACH: ['Journey to', 'Scouting'],
  INTERACT: ['Investigation:', 'The Mystery of'],
  SURVIVE: ['Endure', 'Survival:'],
  CUSTOM: ['The Task of'],
};

function deriveMissionName(type: ObjectiveType, target: WorldEntity | undefined, rand: () => number): string {
  const verbs = NAME_VERBS[type] ?? NAME_VERBS.CUSTOM;
  const verb = verbs[Math.floor(rand() * verbs.length)] ?? verbs[0];
  return `${verb} ${target ? target.name : 'the Unknown'}`;
}

export interface GenerateMissionInput {
  prompt?: string;
  name?: string;
  difficulty?: number;
  chainId?: string;
  order?: number;
}

/** Deterministic for a given (world, prompt, chainId, order) tuple. Never references a missing
 * entity — when the world has no matching candidates, `targetEntityId`/`entityId` are simply
 * omitted (both are optional on `Objective`/`Trigger`), so the result always parses cleanly. */
export function generateMissionDefinition(doc: WorldDocument, input: GenerateMissionInput = {}): MissionDefinition {
  const prompt = input.prompt?.trim() || 'defend the town from the encroaching threat';
  const rand = mulberry32(hashSeed(`${doc.id}:${prompt}:${input.chainId ?? ''}:${input.order ?? 0}`));

  const objectiveType = pickObjectiveType(prompt, rand);
  const candidates = candidatesFor(doc, objectiveType);
  const target = candidates.length > 0 ? candidates[Math.floor(rand() * candidates.length)] : undefined;

  const difficulty = Math.max(1, Math.min(10, input.difficulty ?? Math.round(1 + rand() * 9)));
  const count = objectiveType === 'KILL' || objectiveType === 'COLLECT' ? Math.max(1, Math.round(1 + rand() * 3 * (difficulty / 5))) : undefined;

  const missionId = randomUUID();
  const objective: Objective = {
    id: randomUUID(),
    type: objectiveType,
    ...(target ? { targetEntityId: target.id } : {}),
    ...(count ? { count } : {}),
    description: describeObjective(objectiveType, target, count),
    conditions: [],
  };

  const trigger: Trigger = {
    id: randomUUID(),
    kind: 'ENTER_VOLUME',
    ...(target ? { entityId: target.id } : {}),
    params: { radiusM: 25 },
    actions: [],
  };

  const rewards: Reward[] = [{ type: 'XP', amount: difficulty * 100 }];
  if (rand() > 0.5) rewards.push({ type: 'CURRENCY', amount: difficulty * 25 });
  if (rand() > 0.75) rewards.push({ type: 'ITEM', itemId: `item_reward_${missionId.slice(0, 8)}` });

  const name = input.name?.trim() || deriveMissionName(objectiveType, target, rand);

  return MissionDefinitionSchema.parse({
    id: missionId,
    name,
    description: `${describeObjective(objectiveType, target, count)} (Generated from: "${prompt}")`,
    chainId: input.chainId,
    order: input.order ?? 0,
    objectives: [objective],
    triggers: [trigger],
    rewards,
    difficulty,
    state: 'DRAFT',
  } satisfies z.input<typeof MissionDefinitionSchema>);
}
