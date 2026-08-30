// Provider-agnostic AI completion contract (CONTRACTS.md §8 + §2: "provider-agnostic AIProvider
// interface; adapters anthropic, gemini, mock (mock is default in tests)"). Every adapter takes
// the same request shape and returns the same result shape so pipeline.ts never branches on
// which provider is active.
import type { AIToolName, ToolCall } from '@sonic-gameworld/ai-sdk';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool exposed to the model for this turn — name + description + JSON Schema input shape,
 * already narrowed to the calling agent's allowed subset (see agents/*.ts). */
export interface AIToolSpec {
  name: AIToolName;
  description: string;
  /** JSON Schema (draft-7-ish, just the subset Anthropic/Gemini function-calling need). */
  parameters: Record<string, unknown>;
}

export interface AICompletionRequest {
  /** System prompt: agent persona + world semantic context + RAG knowledge snippets. */
  system: string;
  messages: AIMessage[];
  tools: AIToolSpec[];
  /** Optional structured hints real LLM providers ignore (they read `system`/`messages`
   * instead) but the deterministic `mock` provider uses directly — e.g. the entity name
   * "this area"/"it" should resolve to when the command doesn't name one explicitly. */
  hints?: { anchorName?: string; worldName?: string };
}

export interface AICompletionResult {
  /** Free-text narration/explanation from the model (used to seed the response's `narration`). */
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(request: AICompletionRequest): Promise<AICompletionResult>;
}
