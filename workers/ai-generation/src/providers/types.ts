import type { AIToolName } from '@sonic-gameworld/world-schema';
import type { GeneratedAssetSpec, GenerationUsage } from '../types.js';

export interface GenerationRequest {
  tool: AIToolName;
  prompt: string;
  args: Record<string, unknown>;
}

export interface GenerationProviderResult {
  spec: GeneratedAssetSpec;
  usage: GenerationUsage;
}

export interface AIGenerationProvider {
  readonly name: string;
  readonly model: string;
  generate(request: GenerationRequest): Promise<GenerationProviderResult>;
}
