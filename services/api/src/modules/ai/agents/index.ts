// Agent registry (CONTRACTS.md §8): one AgentDefinition per AIAgentRole, each with its own system
// prompt and tool subset (see ./types.ts's `toolsForRole` for how the subset is derived).
import type { AIAgentRole } from '@sonic-gameworld/ai-sdk';
import { ANALYST_AGENT } from './analyst.js';
import { BUILDER_AGENT } from './builder.js';
import { CINEMATOGRAPHER_AGENT } from './cinematographer.js';
import { DESIGNER_AGENT } from './designer.js';
import { DIRECTOR_AGENT } from './director.js';
import { NPC_AGENT } from './npc.js';
import { ORCHESTRATOR_AGENT } from './orchestrator.js';
import { PUBLISHER_AGENT } from './publisher.js';
import { QA_AGENT } from './qa.js';
import { QUESTMASTER_AGENT } from './questmaster.js';

export type { AgentDefinition, AgentPromptContext } from './types.js';
export { toolsForRole } from './types.js';

export {
  ANALYST_AGENT,
  BUILDER_AGENT,
  CINEMATOGRAPHER_AGENT,
  DESIGNER_AGENT,
  DIRECTOR_AGENT,
  NPC_AGENT,
  ORCHESTRATOR_AGENT,
  PUBLISHER_AGENT,
  QA_AGENT,
  QUESTMASTER_AGENT,
};

export const AGENTS: Record<AIAgentRole, import('./types.js').AgentDefinition> = {
  ORCHESTRATOR: ORCHESTRATOR_AGENT,
  BUILDER: BUILDER_AGENT,
  DIRECTOR: DIRECTOR_AGENT,
  DESIGNER: DESIGNER_AGENT,
  NPC: NPC_AGENT,
  QUESTMASTER: QUESTMASTER_AGENT,
  CINEMATOGRAPHER: CINEMATOGRAPHER_AGENT,
  QA: QA_AGENT,
  ANALYST: ANALYST_AGENT,
  PUBLISHER: PUBLISHER_AGENT,
};

export function getAgent(role: AIAgentRole): import('./types.js').AgentDefinition {
  return AGENTS[role];
}
