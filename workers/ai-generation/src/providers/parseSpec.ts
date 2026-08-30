import type { AIToolName } from '@sonic-gameworld/world-schema';
import type { GeneratedAssetSpec } from '../types.js';
import { mockGenerationProvider } from './mock.js';

/** Both real providers are prompted to reply with strict JSON matching GeneratedAssetSpec. Models
 * occasionally wrap JSON in a code fence or add a stray sentence — strip fences, then take the
 * substring between the first `{` and last `}` before parsing, and validate the required string
 * fields are actually present (not just JSON-shaped) before trusting the result. */
export function parseGeneratedSpec(raw: string, fallbackPrompt: string): GeneratedAssetSpec {
  const stripped = raw.replace(/```json|```/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Provider response did not contain a JSON object');

  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Provider response JSON was not an object');
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : undefined;
  const description = typeof obj.description === 'string' && obj.description.trim() ? obj.description.trim() : undefined;
  if (!title || !description) throw new Error('Provider response JSON is missing required "title"/"description" fields');

  const tags = Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string').slice(0, 12) : [];
  const suggestedCategory = typeof obj.suggestedCategory === 'string' && obj.suggestedCategory ? obj.suggestedCategory.toUpperCase() : 'EXPERIENCE';
  const narration = typeof obj.narration === 'string' && obj.narration ? obj.narration : `Generated "${title}" from: ${fallbackPrompt.slice(0, 200)}`;

  return { title, description, tags, suggestedCategory, narration };
}

/** Used by both real providers as their last-resort recovery: if the model's response can't be
 * parsed into a spec at all, fall back to the deterministic mock spec rather than surfacing a raw
 * parse error as the generation's entire result. */
export async function fallbackSpec(prompt: string, tool: AIToolName): Promise<GeneratedAssetSpec> {
  const result = await mockGenerationProvider.generate({ tool, prompt, args: {} });
  return result.spec;
}
