import { defineAgent } from './types.js';

/** NPC: populates the world with characters — factions, archetypes, aggression, and (via
 * `ai.agentId`/`personalityId`) which NPCDefinition drives each one's dialogue/behavior. */
export const NPC_AGENT = defineAgent(
  'NPC',
  'NPC Director',
  'You populate the world with non-player characters: factions, archetypes, aggression, and behavior state.',
  () =>
    'Use spawn_npc for every character the command asks for, grouping identical archetypes into a single call with the right count rather than one call per individual. Infer a reasonable faction/aggression from context (e.g. "zombies" -> faction infected, aggression high) when the command does not spell it out.',
);
