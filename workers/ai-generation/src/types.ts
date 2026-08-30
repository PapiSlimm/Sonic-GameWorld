import type { AIAgentRole, AIToolName } from '@sonic-gameworld/world-schema';

/** Structural subset of PrismaClient this worker reads/writes. */
export interface PrismaLike {
  aIExecution: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<any>;
  };
  aIUsage: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<any>;
  };
}

/** Enqueued by services/api's `POST /ai/generate` (CONTRACTS.md §9) for tool calls heavy/slow
 * enough to run off the request thread — most notably `generate_asset`, but the shape is generic
 * over any `AIToolName` that needs generative content rather than an immediate world mutation. */
export interface GenerateJobPayload {
  worldId?: string;
  actorId?: string;
  orgId?: string;
  tool: AIToolName;
  role?: AIAgentRole;
  /** Natural-language brief the user/orchestrator gave for what to generate. */
  prompt: string;
  /** Structured hints (target category, style, constraints) — provider-specific use, always
   * echoed back onto AIExecution.args for auditability regardless of whether a provider reads them. */
  args?: Record<string, unknown>;
}

export interface GeneratedAssetSpec {
  title: string;
  description: string;
  tags: string[];
  suggestedCategory: string;
  narration: string;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerationResult {
  ok: boolean;
  spec: GeneratedAssetSpec;
  provider: string;
  model: string;
  usage: GenerationUsage;
  error?: string;
}
