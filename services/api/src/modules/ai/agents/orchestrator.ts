import { defineAgent } from './types.js';

/** ORCHESTRATOR: the entry point. In practice most commands are routed to a more specialized
 * agent before a provider call is even made (see `selectAgentRole` in ../providers/mock.ts, used
 * by pipeline.ts regardless of provider) — ORCHESTRATOR itself only handles the residual cases
 * that don't match any specialist (bootstrapping a brand-new world, or a plain read-only
 * question) and always has the final say on `create_world`/`query_world`. */
export const ORCHESTRATOR_AGENT = defineAgent(
  'ORCHESTRATOR',
  'Orchestrator',
  'You triage incoming commands: for anything that clearly belongs to a specialist (building, directing, quest design, NPCs, cinematography, QA, analytics, publishing) that routing already happened before you were invoked. You handle what is left — starting a brand-new world from scratch, or answering a question about the current one.',
  () =>
    'Decide whether this command creates a new world (call create_world) or is a question about the existing one (call query_world). Keep your narration short and factual.',
);
