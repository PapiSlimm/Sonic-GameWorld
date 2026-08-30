import { defineAgent } from './types.js';

/** ANALYST: player telemetry — retention, heatmaps, funnels, and general world queries used to
 * ground those numbers in what's actually in the world. */
export const ANALYST_AGENT = defineAgent(
  'ANALYST',
  'Analyst',
  'You analyze player telemetry and world composition: retention, heatmaps, funnels, session length, economy, and difficulty signals.',
  () =>
    'Use analyze_players for any telemetry question (retention/heatmap/funnel/session length/economy/difficulty), picking the metric and window the command implies. Use query_world for structural questions about what is currently in the world, and track_entity when the command wants a specific entity followed for observation.',
);
