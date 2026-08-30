// Deterministic mock provider (CONTRACTS.md §2/§8): "mock is default in tests"; "mock provider
// parses simple English ... into tool calls deterministically so the whole stack works with no
// API key." Delegates the actual English->ToolCall[] parsing to `parseCommandMock` from
// @sonic-gameworld/ai-sdk (shared with any other package that wants the same deterministic
// behavior, e.g. a Studio command-bar preview) and adds rule-based agent-role selection on top.
import { parseCommandMock, type AIAgentRole } from '@sonic-gameworld/ai-sdk';
import type { AICompletionRequest, AICompletionResult, AIProvider } from './types.js';

/** Ordered keyword rules; first match wins. Mirrors the role each tool is actually restricted to
 * in AI_TOOL_DEFINITIONS (world-schema/ai-tools.ts) so the mock router's picks are always ones
 * that can execute the tool `parseCommandMock` produces for that same phrase. */
const ROLE_RULES: { pattern: RegExp; role: AIAgentRole }[] = [
  { pattern: /\bpublish\b/i, role: 'PUBLISHER' },
  { pattern: /\b(playtest|bot test|run\s+\d*\s*bots?)\b/i, role: 'QA' },
  { pattern: /\b(analyz|retention|heatmap|funnel|telemetry)/i, role: 'ANALYST' },
  { pattern: /\b(cinematic|camera|drone shot|orbit shot|shot of)\b/i, role: 'CINEMATOGRAPHER' },
  { pattern: /\b(quest|mission|objective|extraction game)\b/i, role: 'QUESTMASTER' },
  { pattern: /\b(boss arena|trigger|zone|outbreak)\b/i, role: 'DESIGNER' },
  { pattern: /\b(npc dialogue|personality|backstory|voice line)\b/i, role: 'NPC' },
  { pattern: /\b(weather|storm|rain|snow|fog|time to|time of day|follow|track)\b/i, role: 'DIRECTOR' },
  { pattern: /\b(spawn|create|build|add|terrain|raise|lower|flatten|carve|road)\b/i, role: 'BUILDER' },
];

/** Rule-based agent-role selection: picks the AIAgentRole best suited to a free-text command
 * when the caller doesn't pin one via `mode`. Falls back to ORCHESTRATOR (which can only read/
 * create-world — safe default for anything unrecognized). */
export function selectAgentRole(text: string): AIAgentRole {
  for (const rule of ROLE_RULES) {
    if (rule.pattern.test(text)) return rule.role;
  }
  return 'ORCHESTRATOR';
}

export class MockProvider implements AIProvider {
  readonly name = 'mock';
  readonly model = 'mock-parser-v1';

  // eslint-disable-next-line @typescript-eslint/require-await
  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const text = (lastUser?.content ?? '').trim();
    const allowed = new Set(request.tools.map((t) => t.name));

    const parsed = parseCommandMock(text, { anchorName: request.hints?.anchorName, worldName: request.hints?.worldName });
    const toolCalls = parsed.filter((tc) => allowed.has(tc.tool));
    const droppedCount = parsed.length - toolCalls.length;

    const narration =
      toolCalls.length > 0
        ? `Parsed ${toolCalls.length} action${toolCalls.length === 1 ? '' : 's'} from "${text}".${
            droppedCount > 0 ? ` (${droppedCount} additional action(s) were outside this agent's tool set and were dropped.)` : ''
          }`
        : `No recognized world-editing action was found in "${text}" — treating it as a question or an unsupported command.`;

    return {
      text: narration,
      toolCalls,
      usage: { inputTokens: Math.max(1, Math.ceil(text.length / 4)), outputTokens: Math.max(1, toolCalls.length * 12) },
    };
  }
}
