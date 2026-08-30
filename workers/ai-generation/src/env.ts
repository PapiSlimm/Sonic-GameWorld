export type AIGenerationProviderName = 'anthropic' | 'gemini' | 'mock';

export interface AIGenerationConfig {
  redisUrl: string;
  eventBusDriver: 'memory' | 'redis' | 'pubsub' | 'kafka';
  concurrency: number;
  /** Which provider to prefer. Falls back to 'mock' automatically if the preferred provider's
   * API key is missing, and falls back to the mock *result* (never throws) if a real provider
   * call fails at request time. */
  provider: AIGenerationProviderName;
  anthropicApiKey?: string;
  anthropicModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AIGenerationConfig {
  return {
    redisUrl: env.REDIS_URL ?? 'redis://localhost:6379',
    eventBusDriver: (env.EVENT_BUS_DRIVER as AIGenerationConfig['eventBusDriver']) ?? 'redis',
    concurrency: Number(env.AI_GENERATION_WORKER_CONCURRENCY ?? 2),
    provider: (env.AI_GENERATION_PROVIDER as AIGenerationProviderName) ?? 'mock',
    anthropicApiKey: env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    geminiModel: env.GEMINI_MODEL ?? 'gemini-1.5-pro',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
