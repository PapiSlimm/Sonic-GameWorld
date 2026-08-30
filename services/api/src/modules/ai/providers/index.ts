// Provider resolution. `services/api/src/config.ts` is a shared file owned by the whole package
// (out of scope for this module to edit — see README's "Appending a module" note), so AI provider
// keys are read straight from `process.env` here rather than threaded through AppConfig.
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { MockProvider, selectAgentRole } from './mock.js';
import type { AIProvider } from './types.js';

export * from './types.js';
export { AnthropicProvider } from './anthropic.js';
export { GeminiProvider } from './gemini.js';
export { MockProvider, selectAgentRole } from './mock.js';

export type AIProviderName = 'anthropic' | 'gemini' | 'mock';

let cachedProvider: AIProvider | undefined;
let cachedProviderName: string | undefined;

/**
 * Resolve the active AIProvider:
 *  - `AI_PROVIDER=mock|anthropic|gemini` forces a specific one (throws if its key is missing).
 *  - Otherwise: `ANTHROPIC_API_KEY` set → anthropic; else `GEMINI_API_KEY` set → gemini; else mock.
 * Cached per-process (env is read once) but re-derived whenever the forcing env var changes,
 * which is all the test suite needs (it never sets real keys, so it always gets `mock`).
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AIProvider {
  const forced = env.AI_PROVIDER as AIProviderName | undefined;
  const cacheKey = `${forced ?? ''}:${env.ANTHROPIC_API_KEY ? '1' : '0'}:${env.GEMINI_API_KEY ? '1' : '0'}`;
  if (cachedProvider && cachedProviderName === cacheKey) return cachedProvider;

  let provider: AIProvider;
  if (forced === 'anthropic' || (!forced && env.ANTHROPIC_API_KEY)) {
    if (!env.ANTHROPIC_API_KEY) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
    provider = new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL });
  } else if (forced === 'gemini' || (!forced && env.GEMINI_API_KEY)) {
    if (!env.GEMINI_API_KEY) throw new Error('AI_PROVIDER=gemini requires GEMINI_API_KEY');
    provider = new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  } else {
    provider = new MockProvider();
  }
  cachedProvider = provider;
  cachedProviderName = cacheKey;
  return provider;
}

/** Test-only: force the next resolveProvider() call to re-derive instead of returning the cache. */
export function resetProviderForTests(): void {
  cachedProvider = undefined;
  cachedProviderName = undefined;
}
