import type { Stage } from '../types.js';

const STOPWORDS = new Set([
  'the', 'and', 'or', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'with', 'material', 'mesh', 'node',
  'mat', 'geo', 'geometry', 'object', 'group', 'default', 'untitled', 'copy', 'v1', 'v2', 'final',
]);

function tokenize(name: string): string[] {
  return name
    .replace(/\.[a-z0-9]+$/i, '')
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((token) => token.split(/(?<=[a-z0-9])(?=[A-Z])/)) // splitCamelCase
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

/** Default keyword-based tagging: pulls candidate terms from the source filename plus every
 * node/mesh/material name in the parsed document, ranked by frequency. An optional AI provider
 * (Anthropic) can enrich this when ANTHROPIC_API_KEY is configured; failures there always fall
 * back to the keyword result rather than failing the pipeline. */
export interface TaggingProvider {
  name: string;
  generateTags(input: { fileName: string; candidateTerms: string[]; kind: string }): Promise<string[]>;
}

export const keywordTaggingProvider: TaggingProvider = {
  name: 'keyword',
  async generateTags({ fileName, candidateTerms }) {
    const freq = new Map<string, number>();
    for (const term of [...tokenize(fileName), ...candidateTerms]) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([term]) => term);
  },
};

interface AnthropicMessageResponse {
  content: { type: string; text?: string }[];
}

/** Talks to the Anthropic Messages API over plain `fetch` (Node 20+ has it globally) rather than
 * pulling in `@anthropic-ai/sdk` as a dependency of this package — asset-processing only needs
 * one lightweight, best-effort call, and every failure mode (network, auth, rate limit, bad
 * response shape) falls back to the keyword provider instead of failing the pipeline. */
export function createAnthropicTaggingProvider(apiKey: string): TaggingProvider {
  return {
    name: 'anthropic',
    async generateTags({ fileName, candidateTerms, kind }) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: `Generate up to 10 short, lowercase, comma-separated marketplace search tags for a ${kind} game asset named "${fileName}". Candidate terms found inside the file: ${candidateTerms.slice(0, 30).join(', ')}. Reply with ONLY the comma-separated tags.`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic tagging request failed: ${res.status} ${res.statusText}`);
      const body = (await res.json()) as AnthropicMessageResponse;
      const text = body.content.map((block) => block.text ?? '').join('');
      const tags = text
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      return tags.length > 0 ? tags : keywordTaggingProvider.generateTags({ fileName, candidateTerms, kind });
    },
  };
}

export function resolveTaggingProvider(anthropicApiKey?: string): TaggingProvider {
  return anthropicApiKey ? createAnthropicTaggingProvider(anthropicApiKey) : keywordTaggingProvider;
}

export const aiTaggingStage: Stage = {
  name: 'AI_TAGGING',
  async run(ctx) {
    const doc = ctx.data.document;
    const candidateTerms: string[] = [];
    if (doc) {
      for (const node of doc.getRoot().listNodes()) if (node.getName()) candidateTerms.push(...tokenize(node.getName()));
      for (const mesh of doc.getRoot().listMeshes()) if (mesh.getName()) candidateTerms.push(...tokenize(mesh.getName()));
      for (const material of doc.getRoot().listMaterials()) if (material.getName()) candidateTerms.push(...tokenize(material.getName()));
    }

    const provider = resolveTaggingProvider(process.env.ANTHROPIC_API_KEY);
    let tags: string[];
    try {
      tags = await provider.generateTags({ fileName: ctx.job.fileName, candidateTerms, kind: ctx.data.kind });
    } catch (err) {
      ctx.log.warn({ err }, `AI tagging provider "${provider.name}" failed — falling back to keyword extraction`);
      tags = await keywordTaggingProvider.generateTags({ fileName: ctx.job.fileName, candidateTerms, kind: ctx.data.kind });
    }

    ctx.data.tags = tags;
    const asset = await ctx.prisma.asset.findUnique({ where: { id: ctx.job.assetId } });
    const existingTags: string[] = Array.isArray(asset?.tags) ? asset.tags : [];
    const merged = Array.from(new Set([...existingTags, ...tags]));
    await ctx.prisma.asset.update({ where: { id: ctx.job.assetId }, data: { tags: merged } });

    return { status: 'OK', details: { provider: provider.name, tags } };
  },
};
