import { scanContentPolicy } from '../contentPolicy.js';
import type { ModerationStage } from '../types.js';

export const contentPolicyStage: ModerationStage = {
  name: 'CONTENT_POLICY',
  async run(ctx) {
    const text = ctx.job.content?.text;
    if (!text || text.trim().length === 0) {
      return { status: 'SKIPPED', details: { reason: 'No text content to scan' } };
    }
    const result = scanContentPolicy(text);
    ctx.data.contentPolicy = { flagged: result.flagged, severity: result.severity, findings: result.findings.map((f) => ({ rule: f.rule, detail: f.detail })) };
    return { status: 'OK', details: { flagged: result.flagged, severity: result.severity, findings: result.findings } };
  },
};
