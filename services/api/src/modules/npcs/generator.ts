// Deterministic NPC generator (§9: `POST /npcs/generate`). Turns a free-text prompt into a full
// `NPCDefinition` — personality, dialogue, behavior — with zero external calls, so the whole
// stack works with no AI provider configured (mirrors the AI module's `mock` provider philosophy).
//
// `aiHook` is the escape hatch CONTRACTS.md asks for: "use AI provider when the ai module exposes
// one later — keep an optional hook". When supplied, its (possibly partial) result is merged over
// the deterministic base — so a prompt like "a grumpy blacksmith who secretly loves poetry" gets
// richer once a real provider is wired in, without this generator ever needing to change or ever
// being able to fail the request (any hook error/rejection is swallowed and we fall back).
import { randomUUID } from 'node:crypto';
import { NPCDefinitionSchema, type NPCDefinition, type NPCDefinitionInput } from '@sonic-gameworld/world-schema';

// ---------------------------------------------------------------------------------------------
// Small deterministic PRNG (same mulberry32 + FNV-1a seed approach as worlds/forge.ts — kept
// local rather than shared to avoid a cross-module dependency for ~10 lines of math).
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

function pick<T>(arr: readonly T[], rand: () => number): T {
  const item = arr[Math.floor(rand() * arr.length)];
  return item as T;
}

// ---------------------------------------------------------------------------------------------
// Archetype library — the "vocabulary" the deterministic generator draws from.
// ---------------------------------------------------------------------------------------------

export interface NpcArchetype {
  key: string;
  aliases: string[];
  traits: string[];
  tone: string;
  faction?: string;
  aggression: number;
  goals: string[];
  states: string[];
  backstoryTemplate: (name: string) => string;
  openingLines: string[];
}

export const NPC_ARCHETYPES: readonly NpcArchetype[] = [
  {
    key: 'GUARD', aliases: ['guard', 'soldier', 'sentry', 'knight', 'watchman'],
    traits: ['disciplined', 'watchful', 'loyal'], tone: 'stern', faction: 'town_guard', aggression: 0.6,
    goals: ['protect the town', 'enforce the law'], states: ['PATROL', 'ALERT', 'IDLE'],
    backstoryTemplate: (n) => `${n} has served on the watch for years, and takes every duty seriously.`,
    openingLines: ['Halt. State your business.', 'Keep moving, citizen.', "I've got my eye on you."],
  },
  {
    key: 'MERCHANT', aliases: ['merchant', 'trader', 'vendor', 'shopkeeper', 'peddler'],
    traits: ['shrewd', 'friendly', 'talkative'], tone: 'warm', faction: 'guild_of_merchants', aggression: 0.05,
    goals: ['turn a profit', 'keep loyal customers'], states: ['IDLE', 'TRADING'],
    backstoryTemplate: (n) => `${n} has run a stall here since before anyone can remember, always ready with a deal.`,
    openingLines: ['Welcome, friend! Take a look at my wares.', 'Best prices in town, I promise you that.'],
  },
  {
    key: 'BANDIT', aliases: ['bandit', 'raider', 'thug', 'outlaw', 'brigand'],
    traits: ['ruthless', 'opportunistic', 'wary'], tone: 'hostile', faction: 'raiders', aggression: 0.9,
    goals: ['survive', 'take what they can'], states: ['WANDER', 'AMBUSH', 'FLEE'],
    backstoryTemplate: (n) => `${n} turned to banditry when the harvest failed, and has not looked back since.`,
    openingLines: ['Your coin or your life.', "You shouldn't have come this way."],
  },
  {
    key: 'SCHOLAR', aliases: ['scholar', 'sage', 'librarian', 'mage', 'wizard'],
    traits: ['curious', 'erudite', 'absent-minded'], tone: 'thoughtful', faction: 'the_archive', aggression: 0.05,
    goals: ['uncover forgotten knowledge', 'teach the willing'], states: ['IDLE', 'RESEARCHING'],
    backstoryTemplate: (n) => `${n} has spent decades buried in books, chasing questions most people never think to ask.`,
    openingLines: ['Ah, a visitor. Do you have a moment for a question?', 'Careful with those pages — older than they look.'],
  },
  {
    key: 'HEALER', aliases: ['healer', 'priest', 'medic', 'doctor', 'cleric'],
    traits: ['compassionate', 'patient', 'calm'], tone: 'gentle', faction: 'the_sanctuary', aggression: 0,
    goals: ['ease suffering', 'protect the vulnerable'], states: ['IDLE', 'TENDING'],
    backstoryTemplate: (n) => `${n} tends to anyone who walks through the door, no questions asked.`,
    openingLines: ['You look like you could use some rest.', 'Sit — let me take a look at that.'],
  },
  {
    key: 'INNKEEPER', aliases: ['innkeeper', 'barkeep', 'host', 'bartender'],
    traits: ['hospitable', 'gossipy', 'pragmatic'], tone: 'jovial', faction: 'guild_of_merchants', aggression: 0,
    goals: ['keep the rooms full', 'hear every rumor in town'], states: ['IDLE', 'SERVING'],
    backstoryTemplate: (n) => `${n} has heard every traveler's tale twice over and still loves a new one.`,
    openingLines: ['Welcome in, stranger! Room or a drink first?', "You look like you've got a story to tell."],
  },
  {
    key: 'BLACKSMITH', aliases: ['blacksmith', 'smith', 'armorer', 'weaponsmith'],
    traits: ['gruff', 'meticulous', 'proud'], tone: 'blunt', faction: 'guild_of_artisans', aggression: 0.1,
    goals: ['forge the finest steel in the region', 'pass on the craft'], states: ['IDLE', 'WORKING'],
    backstoryTemplate: (n) => `${n} judges most people by the quality of the tools they carry, not their words.`,
    openingLines: ['State what you need. I have work to do.', "Good steel isn't cheap, and cheap steel isn't good."],
  },
  {
    key: 'WANDERER', aliases: ['wanderer', 'traveler', 'drifter', 'nomad'],
    traits: ['restless', 'observant', 'guarded'], tone: 'neutral', aggression: 0.15,
    goals: ['keep moving', 'stay out of trouble'], states: ['WANDER', 'IDLE'],
    backstoryTemplate: (n) => `${n} has not stayed in one place long enough to call it home in years.`,
    openingLines: ['Passing through. You?', "Nice town. Won't be here long, though."],
  },
  {
    key: 'QUEST_GIVER', aliases: ['elder', 'mayor', 'chief', 'questgiver', 'quest giver'],
    traits: ['authoritative', 'worried', 'earnest'], tone: 'urgent', aggression: 0.05,
    goals: ['protect their people', 'find someone capable of helping'], states: ['IDLE'],
    backstoryTemplate: (n) => `${n} carries the weight of this place's troubles, and is quietly desperate for help.`,
    openingLines: ['Thank the stars, a capable-looking soul. I need your help.', "Please — we don't have much time."],
  },
] as const;

function pickArchetype(prompt: string, rand: () => number): NpcArchetype {
  const lower = prompt.toLowerCase();
  const matched = NPC_ARCHETYPES.find((a) => a.aliases.some((alias) => lower.includes(alias)));
  return matched ?? pick(NPC_ARCHETYPES, rand);
}

const FIRST_NAMES = ['Bram', 'Sera', 'Torren', 'Yuki', 'Halric', 'Nessa', 'Corin', 'Ada', 'Osric', 'Lira', 'Mira', 'Doran'];

function capitalizeWords(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveName(archetype: NpcArchetype, rand: () => number): string {
  return `${pick(FIRST_NAMES, rand)} the ${capitalizeWords(archetype.key.replace(/_/g, ' '))}`;
}

/** Pull one flavor word straight out of the prompt (e.g. "secretly loves poetry" -> "secretly")
 * so two prompts that pick the same archetype still read as distinct NPCs. */
function extraTraitFromPrompt(prompt: string, traits: string[]): string | undefined {
  const words = prompt
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z-]/g, ''))
    .filter((w) => w.length > 4 && !traits.includes(w));
  return words[0];
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export interface GenerateNpcInput {
  prompt: string;
  name?: string;
  worldId?: string;
  faction?: string;
}

/** Optional AI provider hook (wired in once the `ai` module exposes a real `AIProvider`). Must
 * never throw on the caller's behalf — any rejection here is caught and ignored. */
export type NpcAIHook = (input: GenerateNpcInput) => Promise<Partial<NPCDefinitionInput> | null>;

function mergeNpcInput(base: NPCDefinitionInput, override: Partial<NPCDefinitionInput>): NPCDefinitionInput {
  return {
    ...base,
    ...override,
    personality: { ...base.personality, ...(override.personality ?? {}) },
    memory: { ...base.memory, ...(override.memory ?? {}) },
    knowledge: { ...base.knowledge, ...(override.knowledge ?? {}) },
    behavior: { ...base.behavior, ...(override.behavior ?? {}) },
    dialogue: { ...base.dialogue, ...(override.dialogue ?? {}) },
  };
}

/** Deterministic for a given (prompt, name) pair — same inputs always produce the same NPC, which
 * is what makes this usable in tests without an AI provider. */
export async function generateNpcDefinition(input: GenerateNpcInput, opts: { aiHook?: NpcAIHook } = {}): Promise<NPCDefinition> {
  const rand = mulberry32(hashSeed(`${input.prompt}::${input.name ?? ''}`));
  const archetype = pickArchetype(input.prompt, rand);
  const name = input.name?.trim() || deriveName(archetype, rand);
  const traits = [...archetype.traits];
  const extra = extraTraitFromPrompt(input.prompt, traits);
  if (extra) traits.push(extra);

  const base: NPCDefinitionInput = {
    id: randomUUID(),
    name,
    personality: { traits, backstory: archetype.backstoryTemplate(name), goals: archetype.goals, tone: archetype.tone },
    memory: { enabled: true, capacity: 200 },
    knowledge: { kbIds: [] },
    behavior: { states: archetype.states, aggression: archetype.aggression, faction: input.faction ?? archetype.faction },
    dialogue: { style: archetype.tone, openingLines: archetype.openingLines },
    relationships: [],
  };

  let aiOverride: Partial<NPCDefinitionInput> | null = null;
  if (opts.aiHook) {
    try {
      aiOverride = await opts.aiHook(input);
    } catch {
      aiOverride = null; // AI never gets to fail the primary (deterministic) path.
    }
  }

  const merged = aiOverride ? mergeNpcInput(base, aiOverride) : base;
  return NPCDefinitionSchema.parse(merged);
}
