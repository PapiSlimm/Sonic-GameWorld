// Dependency-free text-safety heuristics, used as the AI_SAFETY stage's baseline (and its fallback
// whenever the optional Anthropic classifier is unavailable or errors — this heuristic layer never
// fails and never calls out to the network). NOT a substitute for a real trust & safety model in
// production: the term lists below are small and representative, tuned to catch the clearest,
// least-ambiguous violations without a high false-positive rate on ordinary game-asset copy
// ("zombie apocalypse shooter", "medieval siege weapons" should NOT be flagged).
import type { ModerationSeverity } from './types.js';

export type SafetyCategory = 'CSAM' | 'EXTREMISM_TERRORISM' | 'SELF_HARM_PROMOTION' | 'HATE_SPEECH' | 'ILLEGAL_WEAPONS_INSTRUCTIONS';

interface CategoryRule {
  category: SafetyCategory;
  severity: ModerationSeverity;
  /** Every pattern is matched independently; ANY match flags the category. Patterns are
   * intentionally narrow (multi-word phrases, not single common words) to keep false positives
   * low on legitimate game content. */
  patterns: RegExp[];
}

const RULES: CategoryRule[] = [
  {
    category: 'CSAM',
    severity: 'CRITICAL',
    patterns: [/\bchild\s+(sexual|explicit|porn)/i, /\bcp\b.{0,20}\b(minor|child|kid)/i, /\bloli(ta)?\s+(porn|sex|nude)/i],
  },
  {
    category: 'EXTREMISM_TERRORISM',
    severity: 'CRITICAL',
    patterns: [/\bhow\s+to\s+(build|make)\s+a\s+bomb\b/i, /\bjoin\s+(isis|al[-\s]?qaeda)\b/i, /\bterrorist\s+attack\s+(plan|tutorial)\b/i],
  },
  {
    category: 'SELF_HARM_PROMOTION',
    severity: 'HIGH',
    patterns: [/\b(how\s+to|ways\s+to)\s+(kill\s+yourself|commit\s+suicide)\b/i, /\bpro[-\s]?(ana|mia)\b/i],
  },
  {
    category: 'HATE_SPEECH',
    severity: 'HIGH',
    patterns: [/\b(gas|exterminate|subhuman)\s+the\s+\w+/i, /\ball\s+\w+\s+(are\s+)?(vermin|subhuman|should\s+die)\b/i],
  },
  {
    category: 'ILLEGAL_WEAPONS_INSTRUCTIONS',
    severity: 'HIGH',
    patterns: [/\bhow\s+to\s+(3d[-\s]?print|manufacture)\s+an?\s+(untraceable\s+)?firearm\b/i, /\bconvert\s+.{0,20}semi[-\s]?auto.{0,20}to\s+(full[-\s]?auto|automatic)\b/i],
  },
];

const SEVERITY_RANK: Record<ModerationSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export interface TextSafetyMatch {
  category: SafetyCategory;
  pattern: string;
}

export interface TextSafetyResult {
  flagged: boolean;
  severity: ModerationSeverity;
  categories: SafetyCategory[];
  matches: TextSafetyMatch[];
  method: 'heuristic' | 'anthropic';
}

export function scanTextSafetyHeuristics(text: string): TextSafetyResult {
  const matches: TextSafetyMatch[] = [];
  const categories = new Set<SafetyCategory>();
  let severity: ModerationSeverity = 'LOW';

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        matches.push({ category: rule.category, pattern: pattern.source });
        categories.add(rule.category);
        if (SEVERITY_RANK[rule.severity] > SEVERITY_RANK[severity]) severity = rule.severity;
      }
    }
  }

  return { flagged: matches.length > 0, severity: matches.length > 0 ? severity : 'LOW', categories: [...categories], matches, method: 'heuristic' };
}

export interface SafetyProvider {
  name: string;
  classify(text: string): Promise<TextSafetyResult>;
}

export const heuristicSafetyProvider: SafetyProvider = {
  name: 'heuristic',
  async classify(text) {
    return scanTextSafetyHeuristics(text);
  },
};

interface AnthropicMessageResponse {
  content: { type: string; text?: string }[];
}

const ANTHROPIC_CATEGORIES: SafetyCategory[] = ['CSAM', 'EXTREMISM_TERRORISM', 'SELF_HARM_PROMOTION', 'HATE_SPEECH', 'ILLEGAL_WEAPONS_INSTRUCTIONS'];

/** Optional nuance layer over the heuristic baseline: asks Claude to classify text against the
 * same fixed category taxonomy (so results stay comparable/aggregable with the heuristic path),
 * and unions its verdict with the heuristic one rather than replacing it — a real provider
 * catching something the regexes miss should still flag, and vice versa. Any network/parse
 * failure propagates to the caller, which is expected to fall back to `heuristicSafetyProvider`. */
export function createAnthropicSafetyProvider(apiKey: string): SafetyProvider {
  return {
    name: 'anthropic',
    async classify(text) {
      const heuristic = scanTextSafetyHeuristics(text);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: `Classify the following user-generated marketplace content against EXACTLY these categories: ${ANTHROPIC_CATEGORIES.join(', ')}. Reply with ONLY a comma-separated list of categories that clearly apply (empty reply if none apply — ordinary violent/dark game themes like "zombie shooter" or "war game" do NOT count). Content: """${text.slice(0, 4000)}"""`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic safety classification failed: ${res.status} ${res.statusText}`);
      const body = (await res.json()) as AnthropicMessageResponse;
      const raw = body.content.map((b) => b.text ?? '').join('');
      const providerCategories = raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is SafetyCategory => (ANTHROPIC_CATEGORIES as string[]).includes(s));

      const categories = new Set<SafetyCategory>([...heuristic.categories, ...providerCategories]);
      let severity = heuristic.severity;
      const ruleByCategory = new Map(RULES.map((r) => [r.category, r.severity]));
      for (const c of providerCategories) {
        const s = ruleByCategory.get(c);
        if (s && SEVERITY_RANK[s] > SEVERITY_RANK[severity]) severity = s;
      }
      return { flagged: categories.size > 0, severity: categories.size > 0 ? severity : 'LOW', categories: [...categories], matches: heuristic.matches, method: 'anthropic' };
    },
  };
}

export function resolveSafetyProvider(anthropicApiKey?: string): SafetyProvider {
  return anthropicApiKey ? createAnthropicSafetyProvider(anthropicApiKey) : heuristicSafetyProvider;
}
