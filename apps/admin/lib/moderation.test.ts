import { describe, expect, it } from 'vitest';
import { inferModerationCategory, toAdminItem, DEMO_MODERATION_QUEUE, MODERATION_CATEGORIES } from './moderation.js';

describe('moderation category inference', () => {
  it('maps known keywords to the seven admin categories', () => {
    expect(inferModerationCategory({ reason: 'Contains an embedded trojan payload', stage: 'AI_SAFETY' })).toBe('MALWARE');
    expect(inferModerationCategory({ reason: 'Ripped from another store, stolen asset', stage: 'CONTENT_POLICY' })).toBe('STOLEN_ASSET');
    expect(inferModerationCategory({ reason: 'Uses a competitor trademark logo', stage: 'LICENSE' })).toBe('TRADEMARK');
    expect(inferModerationCategory({ reason: 'Near-identical copyright similarity to a published title', stage: 'CONTENT_POLICY' })).toBe('COPYRIGHT_SIMILARITY');
    expect(inferModerationCategory({ reason: 'Asset Passport metadata was manipulated', stage: 'METADATA_EXTRACTION' })).toBe('MANIPULATED_METADATA');
    expect(inferModerationCategory({ reason: 'Suspicious obfuscated file structure', stage: 'FILE_VALIDATION' })).toBe('SUSPICIOUS_FILE');
  });

  it('falls back to PROHIBITED_CONTENT when nothing matches', () => {
    expect(inferModerationCategory({ reason: 'Generic policy violation', stage: 'HUMAN_REVIEW' })).toBe('PROHIBITED_CONTENT');
  });

  it('every demo category is one of the seven admin categories', () => {
    for (const item of DEMO_MODERATION_QUEUE) {
      expect(MODERATION_CATEGORIES).toContain(item.category);
    }
  });

  it('toAdminItem derives evidence and a target name from a raw ModerationItem', () => {
    const admin = toAdminItem({
      id: 'mod_x', refKind: 'ASSET', refId: 'asset_abcdef123456', stage: 'AI_SAFETY', status: 'PENDING', severity: 'HIGH',
      reason: 'malware detected', reporterId: null, assigneeId: null, aiVerdict: { label: 'malware', confidence: 0.9 },
      createdAt: new Date().toISOString(), resolvedAt: null,
    });
    expect(admin.category).toBe('MALWARE');
    expect(admin.targetName).toContain('ASSET');
    expect(admin.evidence.length).toBeGreaterThan(0);
  });
});
