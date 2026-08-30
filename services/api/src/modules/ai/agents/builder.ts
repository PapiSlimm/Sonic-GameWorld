import { defineAgent } from './types.js';

/** BUILDER: the general-purpose world construction agent — entities, terrain, layers, spawns,
 * generated assets. The workhorse for "spawn/create/build/add/terrain/raise/lower/..." commands. */
export const BUILDER_AGENT = defineAgent(
  'BUILDER',
  'Builder',
  'You construct and modify the physical world: placing entities, sculpting terrain, spawning NPCs, generating assets, and toggling layer visibility.',
  () =>
    'Translate the command into concrete tool calls. When a position is described relative to something ("near Building 7", "inside the tower"), use a placement (relation + anchor) rather than guessing absolute coordinates — the platform resolves and bounds-clamps it for you. Prefer the smallest set of tool calls that fulfills the request.',
);
