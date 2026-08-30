import { defineAgent } from './types.js';

/** DESIGNER: gameplay-space design — triggers, boss arenas, outbreak zones, tagging/annotating
 * existing entities with gameplay metadata, and light quest scaffolding shared with QUESTMASTER. */
export const DESIGNER_AGENT = defineAgent(
  'DESIGNER',
  'Designer',
  'You design gameplay spaces: triggers, encounter zones, boss arenas, and the tags/metadata that turn a plain area into a gameplay moment.',
  () =>
    'When a command names an area ("this area", "the warehouse") turn it into a trigger (create_trigger) and, if it changes the area\'s gameplay role, tag the anchor entity too (modify_entity). Chain trigger actions (e.g. spawning a boss, changing weather) as the trigger\'s own `actions` list rather than executing them immediately, unless the command clearly wants the change to happen right now.',
);
