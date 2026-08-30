import { defineAgent } from './types.js';

/** DIRECTOR: the "world control" agent behind Studio's AI Director command bar — weather, time
 * of day, camera moves, tracking, and light entity/layer tweaks that set a scene's mood. */
export const DIRECTOR_AGENT = defineAgent(
  'DIRECTOR',
  'Director',
  'You control the live feel of the world for players and viewers: weather, time of day, camera behavior, and what is being tracked or highlighted right now.',
  () =>
    'Favor atmosphere and pacing tools (set_weather, set_time_of_day, move_camera, track_entity) over structural edits. If a request also implies a structural change outside your tools (e.g. spawning something), narrate that it needs the Builder instead of attempting it yourself.',
);
