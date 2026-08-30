import type { AIGenerationConfig } from '../env.js';
import { AnthropicGenerationProvider } from './anthropic.js';
import { GeminiGenerationProvider } from './gemini.js';
import { mockGenerationProvider } from './mock.js';
import type { AIGenerationProvider } from './types.js';

export * from './types.js';
export { mockGenerationProvider } from './mock.js';
export { AnthropicGenerationProvider } from './anthropic.js';
export { GeminiGenerationProvider } from './gemini.js';

/** Resolves the configured provider, falling back to `mock` when the preferred provider's API key
 * isn't configured — never throws at resolution time. Call-time failures (network error, bad
 * response) are the caller's (index.ts's) responsibility to catch and fall back on, since only it
 * knows how to retry with `mockGenerationProvider` and still write a coherent AIExecution row. */
export function resolveGenerationProvider(config: AIGenerationConfig): AIGenerationProvider {
  if (config.provider === 'anthropic' && config.anthropicApiKey) {
    return new AnthropicGenerationProvider({ apiKey: config.anthropicApiKey, model: config.anthropicModel });
  }
  if (config.provider === 'gemini' && config.geminiApiKey) {
    return new GeminiGenerationProvider({ apiKey: config.geminiApiKey, model: config.geminiModel });
  }
  return mockGenerationProvider;
}
