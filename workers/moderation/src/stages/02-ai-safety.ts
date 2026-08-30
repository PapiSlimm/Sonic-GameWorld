import { resolveSafetyProvider } from '../textPolicy.js';
import type { ModerationStage } from '../types.js';

/** Trust & safety text classification (see textPolicy.ts). Never hard-fails the pipeline —
 * everything found here is severity-ranked and handed to HUMAN_REVIEW rather than auto-rejected,
 * because false positives on a keyword/LLM classifier are common enough that an outright
 * auto-reject would be too aggressive for marketplace listings. CRITICAL findings (CSAM,
 * terrorism) still only *escalate* here; MARKETPLACE-level auto-rejection of that content is a
 * policy call for HUMAN_REVIEW/services/api to make explicitly, not something this stage decides
 * unilaterally. */
export const aiSafetyStage: ModerationStage = {
  name: 'AI_SAFETY',
  async run(ctx) {
    const text = ctx.job.content?.text;
    if (!text || text.trim().length === 0) {
      return { status: 'SKIPPED', details: { reason: 'No text content to classify' } };
    }

    const provider = resolveSafetyProvider(ctx.anthropicApiKey);
    let result;
    try {
      result = await provider.classify(text);
    } catch (err) {
      ctx.log.warn({ err }, `AI safety provider "${provider.name}" failed — falling back to heuristics`);
      const { scanTextSafetyHeuristics } = await import('../textPolicy.js');
      result = scanTextSafetyHeuristics(text);
    }

    ctx.data.safety = { flagged: result.flagged, severity: result.severity, categories: result.categories, method: result.method };
    return { status: 'OK', details: { flagged: result.flagged, severity: result.severity, categories: result.categories, method: result.method } };
  },
};
