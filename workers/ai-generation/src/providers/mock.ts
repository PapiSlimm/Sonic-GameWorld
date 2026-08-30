// Deterministic, network-free generation provider — the default (CONTRACTS.md §2: "mock is
// default in tests") and the automatic fallback whenever a real provider isn't configured or its
// call fails. Never throws: every prompt, however short or strange, produces a well-formed
// GeneratedAssetSpec, so the pipeline always has something to write to AIExecution.
import type { AIGenerationProvider, GenerationRequest, GenerationProviderResult } from './types.js';

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with', 'and', 'or', 'that', 'is', 'it', 'this', 'my', 'me', 'please', 'generate', 'create', 'make']);

const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  { category: 'CHARACTER', keywords: ['character', 'npc', 'hero', 'villain', 'creature', 'monster', 'avatar'] },
  { category: 'VEHICLE', keywords: ['car', 'vehicle', 'ship', 'mech', 'tank', 'aircraft', 'bike', 'motorcycle', 'drone'] },
  { category: 'ENVIRONMENT', keywords: ['forest', 'city', 'dungeon', 'landscape', 'terrain', 'biome', 'map', 'world'] },
  { category: 'WORLD', keywords: ['world', 'planet', 'realm'] },
  { category: 'MISSION', keywords: ['quest', 'mission', 'objective'] },
  { category: 'CINEMATIC', keywords: ['cutscene', 'cinematic', 'trailer'] },
  { category: 'SYSTEM', keywords: ['system', 'mechanic', 'gameplay'] },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function titleCase(words: string[]): string {
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function guessCategory(tokens: string[], tool: string): string {
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (tokens.some((t) => keywords.includes(t))) return category;
  }
  if (tool === 'spawn_npc') return 'CHARACTER';
  if (tool === 'create_quest') return 'MISSION';
  if (tool === 'create_cinematic') return 'CINEMATIC';
  if (tool === 'create_world') return 'WORLD';
  return 'EXPERIENCE';
}

export const mockGenerationProvider: AIGenerationProvider = {
  name: 'mock',
  model: 'mock-deterministic-v1',
  async generate(request: GenerationRequest): Promise<GenerationProviderResult> {
    const tokens = tokenize(request.prompt);
    const meaningful = tokens.length > 0 ? tokens : ['generated', 'asset'];
    const title = titleCase(meaningful.slice(0, 4));
    const category = guessCategory(tokens, request.tool);
    const tags = Array.from(new Set(meaningful)).slice(0, 8);
    const description = `A ${category.toLowerCase().replace('_', ' ')} concept generated from the brief: "${request.prompt.trim().slice(0, 240)}".`;
    const narration = `I've drafted "${title}" (${category}) based on your description. Review the suggested tags and category before publishing.`;

    return {
      spec: { title: title || 'Untitled Generation', description, tags, suggestedCategory: category, narration },
      // Deterministic "usage" proportional to input length keeps AIUsage numbers meaningful in
      // dev/test without a real token count from a live model.
      usage: { inputTokens: Math.max(1, Math.ceil(request.prompt.length / 4)), outputTokens: Math.max(1, Math.ceil(description.length / 4)) },
    };
  },
};
