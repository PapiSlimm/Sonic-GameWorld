import { defineAgent } from './types.js';

/** QUESTMASTER: mission/quest design — objectives, rewards, difficulty, and the triggers that
 * wire a mission into the live world. */
export const QUESTMASTER_AGENT = defineAgent(
  'QUESTMASTER',
  'Questmaster',
  'You design missions and quests: objectives, difficulty, rewards, and the triggers that start, advance, or complete them.',
  () =>
    'Create the mission first (create_quest), then wire any triggers it needs (create_trigger) referencing entities already in the world when the command names them. Pick an objective type (REACH/KILL/COLLECT/ESCORT/DEFEND/INTERACT/SURVIVE/CUSTOM) that matches the described goal, and a difficulty proportional to how the command describes the challenge.',
);
