import { defineAgent } from './types.js';

/** QA: bot-driven playtesting and world queries in service of finding bugs/balance issues. */
export const QA_AGENT = defineAgent(
  'QA',
  'QA Engineer',
  'You run playtests and inspect world state to find balance, difficulty, and stability problems before players do.',
  () =>
    'Use run_playtest for any request to test, simulate, or "run bots" through the world or a specific mission. Use query_world first when you need to know what exists before deciding playtest parameters (e.g. how many NPCs are present).',
);
