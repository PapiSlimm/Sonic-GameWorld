// Shared agent-definition shape (CONTRACTS.md §8: "agents/*.ts (ORCHESTRATOR routes to
// BUILDER/DIRECTOR/DESIGNER/NPC/QUESTMASTER/CINEMATOGRAPHER/QA/ANALYST/PUBLISHER each with its own
// system prompt and allowed tool subset)").
//
// Each role's *allowed tool subset* is derived from `AI_TOOL_DEFINITIONS[tool].roles`
// (@sonic-gameworld/world-schema/ai-tools.ts) rather than hand-duplicated per agent file — that
// table is already the canonical role -> tool mapping (it's also what `providers/mock.ts`'s
// `ROLE_RULES` comment points at), so deriving here guarantees an agent's exposed tools can never
// drift from what `tools/registry.ts`'s `ToolDefinition.roles` will actually let it execute.
import { AI_TOOL_DEFINITIONS, AI_TOOL_NAMES, type AIAgentRole, type AIToolName } from '@sonic-gameworld/ai-sdk';

export interface AgentPromptContext {
  /** The world's current name (for grounding, e.g. "You are editing 'Neon Harbor'."). */
  worldName: string;
  /** sceneGraphToSemantic(doc) + any RAG knowledge snippets (see ../context.ts). */
  semanticContext: string;
  /** The player/creator's raw command text. */
  userText: string;
}

export interface AgentDefinition {
  role: AIAgentRole;
  label: string;
  description: string;
  /** Tool names this agent is allowed to call, in AI_TOOL_NAMES order. */
  allowedTools: AIToolName[];
  systemPrompt(ctx: AgentPromptContext): string;
}

/** Every tool whose `AI_TOOL_DEFINITIONS[...].roles` includes `role`, in canonical order. */
export function toolsForRole(role: AIAgentRole): AIToolName[] {
  return AI_TOOL_NAMES.filter((name) => AI_TOOL_DEFINITIONS[name].roles.includes(role));
}

/** Common preamble every agent's system prompt shares: identity, world grounding, hard
 * constraints (never narrate a mutation without calling the matching tool; stay in-world). */
function preamble(agent: Pick<AgentDefinition, 'label' | 'description'>, ctx: AgentPromptContext): string {
  return [
    `You are the ${agent.label}, one specialized role inside GameWorld AI, the AI orchestrator for the Sonic GameWorld OS spatial editor.`,
    agent.description,
    `You are working in the world "${ctx.worldName}". AI never mutates world state directly — every change must go through one of your available tools, which are validated (bounds, quotas, licensing) and executed by the platform, not by you. If a request needs something outside your tool set, say so in your narration instead of inventing a tool.`,
    'Current world state:',
    ctx.semanticContext,
  ].join('\n\n');
}

/** Build an AgentDefinition: allowedTools is always the canonical `toolsForRole(role)` set. */
export function defineAgent(
  role: AIAgentRole,
  label: string,
  description: string,
  instructions: (ctx: AgentPromptContext) => string,
): AgentDefinition {
  return {
    role,
    label,
    description,
    allowedTools: toolsForRole(role),
    systemPrompt: (ctx) => `${preamble({ label, description }, ctx)}\n\n${instructions(ctx)}\n\nCommand: "${ctx.userText}"`,
  };
}
