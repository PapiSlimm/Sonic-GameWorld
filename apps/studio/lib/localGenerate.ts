import { randomUuid } from '@sonic-gameworld/world-schema';
import type { MissionDefinition, NPCDefinition } from '@sonic-gameworld/gameworld-sdk';

/**
 * Deterministic offline stand-ins for `POST /v1/missions/generate` and `POST /v1/npcs/generate`
 * (CONTRACTS §9) so the Missions and NPCs "Generate with AI" actions work without a live API.
 */

const OBJECTIVE_TEMPLATES: Array<{ type: MissionDefinition['objectives'][number]['type']; verb: string }> = [
  { type: 'REACH', verb: 'Reach' },
  { type: 'COLLECT', verb: 'Collect' },
  { type: 'DEFEND', verb: 'Defend' },
  { type: 'ESCORT', verb: 'Escort' },
  { type: 'SURVIVE', verb: 'Survive at' },
  { type: 'INTERACT', verb: 'Interact with' },
];

function titleFromPrompt(prompt: string, i: number): string {
  const words = prompt
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const seed = words.slice(0, 4).join(' ') || 'Untitled Objective';
  return i === 0 ? seed[0]!.toUpperCase() + seed.slice(1) : `${seed} — Part ${i + 1}`;
}

export function generateMissionsLocal(prompt: string, opts: { count?: number; difficulty?: number; chainId?: string } = {}): MissionDefinition[] {
  const count = Math.min(5, Math.max(1, opts.count ?? 1));
  const difficulty = Math.min(10, Math.max(1, opts.difficulty ?? 3 + Math.round(Math.random() * 3)));
  return Array.from({ length: count }, (_, i) => {
    const template = OBJECTIVE_TEMPLATES[i % OBJECTIVE_TEMPLATES.length]!;
    const name = titleFromPrompt(prompt, i);
    return {
      id: randomUuid(),
      name,
      description: prompt.trim() || `Generated mission based on "${prompt}"`,
      chainId: opts.chainId,
      order: i,
      objectives: [
        {
          id: randomUuid(),
          type: template.type,
          description: `${template.verb} the target described in: "${prompt.slice(0, 80)}"`,
          count: template.type === 'COLLECT' ? 3 + i : undefined,
          timeLimitS: template.type === 'SURVIVE' ? 120 : undefined,
          conditions: [],
        },
      ],
      triggers: [],
      rewards: [
        { type: 'XP', amount: 100 * (i + 1) },
        { type: 'CURRENCY', amount: 25 * (i + 1) },
      ],
      difficulty,
      state: 'DRAFT',
    } satisfies MissionDefinition;
  });
}

const TRAIT_BANK = ['resourceful', 'guarded', 'loyal', 'sardonic', 'idealistic', 'ruthless', 'curious', 'weary'];
const TONE_BANK = ['clipped and professional', 'warm and talkative', 'cold and calculating', 'anxious', 'gruff'];
const FACTIONS = ['Neon Wardens', 'Undercity Syndicate', 'Free Citizens', 'Corporate Security', 'Independent'];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!;
}

export function generateNPCsLocal(prompt: string, opts: { count?: number; archetype?: string; faction?: string } = {}): NPCDefinition[] {
  const count = Math.min(6, Math.max(1, opts.count ?? 1));
  const base = prompt.trim() || opts.archetype || 'Wandering Contact';
  return Array.from({ length: count }, (_, i) => {
    const name = count === 1 ? titleFromPrompt(base, 0) : `${titleFromPrompt(base, 0)} ${i + 1}`;
    return {
      id: randomUuid(),
      name,
      personality: {
        traits: [pick(TRAIT_BANK, i), pick(TRAIT_BANK, i + 3)],
        backstory: `Generated from the prompt: "${prompt}".`,
        goals: ['Survive the district', 'Protect what matters to them'],
        tone: pick(TONE_BANK, i),
      },
      memory: { enabled: true, capacity: 50 },
      knowledge: { kbIds: [] },
      behavior: { states: ['idle', 'alert', 'engaged'], aggression: Math.round(Math.random() * 60) / 100, faction: opts.faction ?? pick(FACTIONS, i) },
      dialogue: { style: pick(TONE_BANK, i), openingLines: [`You looking for something in particular?`, `Careful out there.`] },
      relationships: [],
    } satisfies NPCDefinition;
  });
}
