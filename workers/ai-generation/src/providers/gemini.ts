import { GoogleGenerativeAI } from '@google/generative-ai';
import { fallbackSpec, parseGeneratedSpec } from './parseSpec.js';
import type { AIGenerationProvider, GenerationProviderResult, GenerationRequest } from './types.js';

const SYSTEM_PROMPT = `You are the GameWorld AI asset-generation assistant. Given a creator's brief, respond with ONLY a JSON object (no prose, no code fences) matching exactly:
{"title": string, "description": string (2-3 sentences), "tags": string[] (5-10 lowercase single/two-word tags), "suggestedCategory": one of WORLD|GAME_KIT|SYSTEM|AI_AGENT|CHARACTER|VEHICLE|ENVIRONMENT|CINEMATIC|MISSION|EXPERIENCE, "narration": string (one friendly sentence explaining what you generated, addressed to the creator)}`;

export interface GeminiGenerationOptions {
  apiKey: string;
  model?: string;
}

export class GeminiGenerationProvider implements AIGenerationProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly client: GoogleGenerativeAI;

  constructor(opts: GeminiGenerationOptions) {
    this.client = new GoogleGenerativeAI(opts.apiKey);
    this.model = opts.model ?? 'gemini-1.5-pro';
  }

  async generate(request: GenerationRequest): Promise<GenerationProviderResult> {
    const model = this.client.getGenerativeModel({ model: this.model, systemInstruction: SYSTEM_PROMPT, generationConfig: { responseMimeType: 'application/json' } });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Tool: ${request.tool}\nBrief: ${request.prompt}\nExtra constraints (JSON, may be empty): ${JSON.stringify(request.args)}` }] }],
    });
    const text = result.response.text();

    let spec;
    try {
      spec = parseGeneratedSpec(text, request.prompt);
    } catch {
      spec = await fallbackSpec(request.prompt, request.tool);
    }

    const usage = result.response.usageMetadata;
    return { spec, usage: { inputTokens: usage?.promptTokenCount ?? 0, outputTokens: usage?.candidatesTokenCount ?? 0 } };
  }
}
