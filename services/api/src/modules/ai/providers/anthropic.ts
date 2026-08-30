// Anthropic tool-use adapter (CONTRACTS.md §2/§8): "tool use via @anthropic-ai/sdk". Used when
// ANTHROPIC_API_KEY is set; see providers/index.ts for provider resolution.
import Anthropic from '@anthropic-ai/sdk';
import { AI_TOOL_SCHEMAS, ToolCallSchema, type AIToolName, type ToolCall } from '@sonic-gameworld/ai-sdk';
import { zodToJsonSchema } from './jsonSchema.js';
import type { AICompletionRequest, AICompletionResult, AIProvider, AIToolSpec } from './types.js';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

function toAnthropicTools(tools: AIToolSpec[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
}

/** Parse tool_use content blocks into validated ToolCall[]; silently drops any block whose
 * `input` doesn't satisfy the tool's own zod schema rather than throwing — a malformed model
 * response should surface as "the model proposed nothing usable", not a 500. */
function extractToolCalls(content: Anthropic.ContentBlock[]): { text: string; toolCalls: ToolCall[] } {
  const textParts: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      textParts.push(block.text);
      continue;
    }
    if (block.type === 'tool_use') {
      const name = block.name as AIToolName;
      if (!(name in AI_TOOL_SCHEMAS)) continue;
      const candidate = ToolCallSchema.safeParse({ tool: name, args: block.input });
      if (candidate.success) toolCalls.push(candidate.data);
    }
  }
  return { text: textParts.join('\n').trim(), toolCalls };
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-3-5-sonnet-latest';
    this.maxTokens = opts.maxTokens ?? 2048;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: request.system,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: toAnthropicTools(request.tools),
    });
    const { text, toolCalls } = extractToolCalls(response.content);
    return {
      text,
      toolCalls,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

export function toolSpecFromSchema(name: AIToolName, description: string): AIToolSpec {
  return { name, description, parameters: zodToJsonSchema(AI_TOOL_SCHEMAS[name]) };
}
