// Gemini function-calling adapter (CONTRACTS.md §2/§8: "gemini.ts (function calling)"). Used
// when GEMINI_API_KEY is set; see providers/index.ts for provider resolution.
import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Schema } from '@google/generative-ai';
import { AI_TOOL_SCHEMAS, ToolCallSchema, type AIToolName, type ToolCall } from '@sonic-gameworld/ai-sdk';
import { zodToJsonSchema } from './jsonSchema.js';
import type { AICompletionRequest, AICompletionResult, AIProvider, AIToolSpec } from './types.js';

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
}

/** Our zodToJsonSchema() emits plain JSON Schema (`type: 'string'`); Gemini's Schema type wants
 * the `SchemaType` enum (`STRING`, `OBJECT`, ...) and only a subset of keywords. */
function toGeminiSchema(js: Record<string, unknown>): Schema {
  const type = js.type as string | undefined;
  const schema: Schema = {};
  switch (type) {
    case 'string':
      schema.type = SchemaType.STRING;
      if (Array.isArray(js.enum)) schema.enum = js.enum as string[];
      break;
    case 'number':
      schema.type = SchemaType.NUMBER;
      break;
    case 'boolean':
      schema.type = SchemaType.BOOLEAN;
      break;
    case 'array':
      schema.type = SchemaType.ARRAY;
      schema.items = toGeminiSchema((js.items as Record<string, unknown>) ?? { type: 'string' });
      break;
    case 'object':
    default: {
      schema.type = SchemaType.OBJECT;
      const props = (js.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
      schema.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
      if (Array.isArray(js.required) && js.required.length > 0) schema.required = js.required as string[];
      break;
    }
  }
  return schema;
}

function toFunctionDeclarations(tools: AIToolSpec[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toGeminiSchema(t.parameters) as FunctionDeclaration['parameters'],
  }));
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly client: GoogleGenerativeAI;

  constructor(opts: GeminiProviderOptions) {
    this.client = new GoogleGenerativeAI(opts.apiKey);
    this.model = opts.model ?? 'gemini-1.5-pro';
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: request.system,
      tools: [{ functionDeclarations: toFunctionDeclarations(request.tools) }],
    });
    const result = await model.generateContent({
      contents: request.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    });
    const response = result.response;
    const text = (() => {
      try {
        return response.text().trim();
      } catch {
        return '';
      }
    })();
    const calls = response.functionCalls() ?? [];
    const toolCalls: ToolCall[] = [];
    for (const call of calls) {
      const name = call.name as AIToolName;
      if (!(name in AI_TOOL_SCHEMAS)) continue;
      const candidate = ToolCallSchema.safeParse({ tool: name, args: call.args });
      if (candidate.success) toolCalls.push(candidate.data);
    }
    const usage = response.usageMetadata;
    return {
      text,
      toolCalls,
      usage: { inputTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0 },
    };
  }
}

export function toolSpecFromSchema(name: AIToolName, description: string): AIToolSpec {
  return { name, description, parameters: zodToJsonSchema(AI_TOOL_SCHEMAS[name]) };
}
