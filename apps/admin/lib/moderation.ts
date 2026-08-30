import type { ModerationItem, ModerationQueueQuery, Page } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

/**
 * The API's `ModerationItem` (CONTRACTS §9 / gameworld-sdk) carries a free-text `reason` and a
 * pipeline `stage`, not a fixed taxonomy. The admin console needs the seven concrete categories
 * called out in the assignment, so we layer a `ModerationCategory` on top: demo rows carry it
 * directly, and live rows get it inferred from `reason`/`stage` via keyword matching.
 */
export type ModerationCategory =
  | 'STOLEN_ASSET'
  | 'MALWARE'
  | 'PROHIBITED_CONTENT'
  | 'SUSPICIOUS_FILE'
  | 'TRADEMARK'
  | 'COPYRIGHT_SIMILARITY'
  | 'MANIPULATED_METADATA';

export const MODERATION_CATEGORIES: ModerationCategory[] = [
  'STOLEN_ASSET',
  'MALWARE',
  'PROHIBITED_CONTENT',
  'SUSPICIOUS_FILE',
  'TRADEMARK',
  'COPYRIGHT_SIMILARITY',
  'MANIPULATED_METADATA',
];

export const MODERATION_CATEGORY_LABEL: Record<ModerationCategory, string> = {
  STOLEN_ASSET: 'Stolen Assets',
  MALWARE: 'Malware',
  PROHIBITED_CONTENT: 'Prohibited Content',
  SUSPICIOUS_FILE: 'Suspicious Files',
  TRADEMARK: 'Trademark',
  COPYRIGHT_SIMILARITY: 'Copyright Similarity',
  MANIPULATED_METADATA: 'Manipulated Metadata',
};

export const MODERATION_CATEGORY_TONE: Record<ModerationCategory, 'danger' | 'warn' | 'violet' | 'info'> = {
  STOLEN_ASSET: 'danger',
  MALWARE: 'danger',
  PROHIBITED_CONTENT: 'danger',
  SUSPICIOUS_FILE: 'warn',
  TRADEMARK: 'violet',
  COPYRIGHT_SIMILARITY: 'violet',
  MANIPULATED_METADATA: 'info',
};

export interface ModerationEvidence {
  label: string;
  detail: string;
  url?: string;
}

export interface AdminModerationItem extends ModerationItem {
  category: ModerationCategory;
  targetName: string;
  evidence: ModerationEvidence[];
}

const CATEGORY_KEYWORDS: [RegExp, ModerationCategory][] = [
  [/malware|virus|trojan|exploit|ransomware/i, 'MALWARE'],
  [/stolen|ripped|unauthorized copy|scraped/i, 'STOLEN_ASSET'],
  [/trademark|logo misuse|brand infringement/i, 'TRADEMARK'],
  [/copyright|plagiar|near[- ]identical|similarity/i, 'COPYRIGHT_SIMILARITY'],
  [/metadata|exif|provenance|passport tamper/i, 'MANIPULATED_METADATA'],
  [/suspicious|obfuscat|packed executable|zip bomb|polyglot/i, 'SUSPICIOUS_FILE'],
];

export function inferModerationCategory(item: Pick<ModerationItem, 'reason' | 'stage'>): ModerationCategory {
  const haystack = `${item.reason} ${item.stage}`;
  for (const [re, category] of CATEGORY_KEYWORDS) {
    if (re.test(haystack)) return category;
  }
  return 'PROHIBITED_CONTENT';
}

export function toAdminItem(item: ModerationItem): AdminModerationItem {
  return {
    ...item,
    category: inferModerationCategory(item),
    targetName: `${item.refKind} ${item.refId.slice(0, 8)}`,
    evidence: [
      { label: 'Reference', detail: `${item.refKind} · ${item.refId}` },
      { label: 'Pipeline stage', detail: item.stage },
      ...(item.aiVerdict ? [{ label: 'AI verdict', detail: `${item.aiVerdict.label} (${Math.round(item.aiVerdict.confidence * 100)}% confidence)${item.aiVerdict.notes ? ` — ${item.aiVerdict.notes}` : ''}` }] : []),
    ],
  };
}

async function listLiveModerationQueue(query?: ModerationQueueQuery): Promise<Page<ModerationItem>> {
  return getClient().moderation.queue(query);
}

export async function fetchModerationQueue(query?: ModerationQueueQuery): Promise<AdminModerationItem[]> {
  const page = await listLiveModerationQueue(query);
  return page.items.map(toAdminItem);
}

export async function resolveModerationCase(
  id: string,
  resolution: 'APPROVED' | 'REJECTED' | 'ESCALATED',
  action: 'NONE' | 'DELIST' | 'BAN' | 'WARN',
  notes?: string,
): Promise<ModerationItem> {
  return getClient().moderation.resolve(id, { resolution, action, notes });
}

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

export const DEMO_MODERATION_QUEUE: AdminModerationItem[] = [
  {
    id: 'mod_demo_01', refKind: 'ASSET', refId: 'asset_7f2c9a1b', stage: 'AI_SAFETY', status: 'PENDING', severity: 'CRITICAL',
    reason: 'Uploaded archive contains an obfuscated executable payload disguised as a texture pack.',
    reporterId: null, assigneeId: null, aiVerdict: { label: 'malware.suspected', confidence: 0.97, notes: 'Packed PE header found inside .zip' },
    createdAt: hoursAgo(1), resolvedAt: null, category: 'MALWARE', targetName: 'NeonCity_Textures_HD.zip',
    evidence: [
      { label: 'Scanner', detail: 'ClamAV heuristic match: Win.Trojan.Packed-9981' },
      { label: 'File', detail: 'NeonCity_Textures_HD.zip → payload.dll (obfuscated)' },
      { label: 'Uploader history', detail: '2 prior rejected uploads in the last 30 days' },
    ],
  },
  {
    id: 'mod_demo_02', refKind: 'PRODUCT', refId: 'prod_88ab3d4e', stage: 'CONTENT_POLICY', status: 'IN_REVIEW', severity: 'HIGH',
    reason: 'Listing artwork appears to be re-uploaded from a competing marketplace with only the watermark cropped.',
    reporterId: 'user_2201', assigneeId: 'user_admin_09', aiVerdict: { label: 'stolen_asset.likely', confidence: 0.88 },
    createdAt: hoursAgo(3), resolvedAt: null, category: 'STOLEN_ASSET', targetName: 'Cyberpunk Alley Kit',
    evidence: [
      { label: 'Reverse image match', detail: '94% perceptual hash match to a listing on a third-party store' },
      { label: 'Reporter note', detail: 'Original creator flagged this as a direct re-upload of their asset.' },
    ],
  },
  {
    id: 'mod_demo_03', refKind: 'ASSET', refId: 'asset_11de2290', stage: 'LICENSE', status: 'PENDING', severity: 'MEDIUM',
    reason: 'Character model uses a recognizable third-party game logo on in-world signage.',
    reporterId: null, assigneeId: null, aiVerdict: { label: 'trademark.review', confidence: 0.71 },
    createdAt: hoursAgo(5), resolvedAt: null, category: 'TRADEMARK', targetName: 'Retro Arcade Cabinet Pack',
    evidence: [{ label: 'Vision model', detail: 'Detected logo mark on 3 of 12 texture maps' }],
  },
  {
    id: 'mod_demo_04', refKind: 'WORLD', refId: 'world_5599aa11', stage: 'AI_SAFETY', status: 'ESCALATED', severity: 'HIGH',
    reason: 'World description and signage contain content violating the prohibited-content policy (extremist symbology).',
    reporterId: 'user_3390', assigneeId: 'user_admin_02', aiVerdict: { label: 'policy.violation', confidence: 0.93 },
    createdAt: hoursAgo(8), resolvedAt: null, category: 'PROHIBITED_CONTENT', targetName: 'Frontier Outpost Alpha',
    evidence: [
      { label: 'Policy match', detail: 'Symbol classifier flagged banner texture in Zone 3' },
      { label: 'Escalated by', detail: 'user_admin_02 — needs Trust & Safety sign-off' },
    ],
  },
  {
    id: 'mod_demo_05', refKind: 'ASSET', refId: 'asset_c02194bb', stage: 'FILE_VALIDATION', status: 'PENDING', severity: 'MEDIUM',
    reason: 'Uploaded GLB contains an unusually large embedded script blob with obfuscated variable names.',
    reporterId: null, assigneeId: null, aiVerdict: { label: 'suspicious_file.review', confidence: 0.64 },
    createdAt: hoursAgo(11), resolvedAt: null, category: 'SUSPICIOUS_FILE', targetName: 'Dynamic_Foliage_System.glb',
    evidence: [{ label: 'Static analysis', detail: 'Minified script segment (18kb) with no author-supplied source map' }],
  },
  {
    id: 'mod_demo_06', refKind: 'PRODUCT', refId: 'prod_44cc7712', stage: 'CONTENT_POLICY', status: 'PENDING', severity: 'LOW',
    reason: 'Mission dialogue closely mirrors published dialogue from an unrelated commercial title (near-identical phrasing).',
    reporterId: 'user_7781', assigneeId: null, aiVerdict: { label: 'copyright.similarity', confidence: 0.58 },
    createdAt: hoursAgo(14), resolvedAt: null, category: 'COPYRIGHT_SIMILARITY', targetName: 'Vault Heist: Chapter One',
    evidence: [{ label: 'Text similarity', detail: '82% n-gram overlap across 6 dialogue lines' }],
  },
  {
    id: 'mod_demo_07', refKind: 'ASSET', refId: 'asset_9a11bb02', stage: 'METADATA_EXTRACTION', status: 'PENDING', severity: 'MEDIUM',
    reason: 'Asset Passport shows edited creation timestamp and stripped modification history inconsistent with upload logs.',
    reporterId: null, assigneeId: null, aiVerdict: { label: 'metadata.manipulated', confidence: 0.81 },
    createdAt: hoursAgo(20), resolvedAt: null, category: 'MANIPULATED_METADATA', targetName: 'Ancient Ruins Environment Pack',
    evidence: [{ label: 'Passport diff', detail: 'createdAt back-dated by 41 days; modificationHistory array emptied' }],
  },
  {
    id: 'mod_demo_08', refKind: 'REVIEW', refId: 'rev_00119923', stage: 'AI_SAFETY', status: 'REJECTED', severity: 'LOW',
    reason: 'Review contained harassment directed at the creator; removed prior to this queue snapshot.',
    reporterId: 'user_1010', assigneeId: 'user_admin_02', aiVerdict: null,
    createdAt: hoursAgo(30), resolvedAt: hoursAgo(29), category: 'PROHIBITED_CONTENT', targetName: 'Review on "Skyline Racer"',
    evidence: [{ label: 'Resolution', detail: 'Rejected and removed by user_admin_02' }],
  },
  {
    id: 'mod_demo_09', refKind: 'GAME', refId: 'game_44a1290b', stage: 'HUMAN_REVIEW', status: 'APPROVED', severity: 'LOW',
    reason: 'Initial malware scan false-positive on a compression library; cleared after manual binary review.',
    reporterId: null, assigneeId: 'user_admin_09', aiVerdict: { label: 'malware.false_positive', confidence: 0.4 },
    createdAt: hoursAgo(40), resolvedAt: hoursAgo(38), category: 'MALWARE', targetName: 'Skyline Racer: Season 2',
    evidence: [{ label: 'Resolution', detail: 'Approved — verified benign by user_admin_09' }],
  },
  {
    id: 'mod_demo_10', refKind: 'NPC', refId: 'npc_2a9910cc', stage: 'CONTENT_POLICY', status: 'PENDING', severity: 'MEDIUM',
    reason: "NPC dialogue tree references a competitor's registered character name verbatim.",
    reporterId: 'user_5541', assigneeId: null, aiVerdict: { label: 'trademark.review', confidence: 0.69 },
    createdAt: hoursAgo(46), resolvedAt: null, category: 'TRADEMARK', targetName: 'Companion NPC "Zayne"',
    evidence: [{ label: 'Text match', detail: 'Dialogue references a third-party trademarked character name' }],
  },
];
