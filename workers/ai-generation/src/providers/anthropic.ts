import Anthropic from '@anthropic-ai/sdk';
import { fallbackSpec, parseGeneratedSpec } from './parseSpec.js';
import type { AIGenerationProvider, GenerationProviderResult, GenerationRequest } from './types.js';

const SYSTEM_PROMPT = `You are the GameWorld AI asset-generation assistant. Given a creator's brief, respond with ONLY a JSON object (no prose, no code fences) matching exactly:
{"title": string, "description": string (2-3 sentences), "tags": string[] (5-10 lowercase single/two-word tags), "suggestedCategory": one of WORLD|GAME_KIT|SYSTEM|AI_AGENT|CHARACTER|VEHICLE|ENVIRONMENT|CINEMATIC|MISSION|EXPERIENCE, "narration": string (one friendly sentence explaining what you generated, addressed to the creator)}`;

export interface AnthropicGenerationOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicGenerationProvider implements AIGenerationProvider {
  readonly name = 'anthropic';
  readonly model: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(opts: AnthropicGenerationOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-3-5-sonnet-latest';
    this.maxTokens = opts.maxTokens ?? 1024;
  }

  async generate(request: GenerationRequest): Promise<GenerationProviderResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Tool: ${request.tool}\nBrief: ${request.prompt}\nExtra constraints (JSON, may be empty): ${JSON.stringify(request.args)}` }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    let spec;
    try {
      spec = parseGeneratedSpec(text, request.prompt);
    } catch {
      spec = await fallbackSpec(request.prompt, request.tool);
    }

    return { spec, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
  }
}
