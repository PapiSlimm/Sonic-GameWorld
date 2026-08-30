/**
 * Feature flags have no backing route in CONTRACTS §9 — this is a fully local, persisted table
 * (localStorage) so the UI is genuinely usable in demos and across reloads. A real implementation
 * would back this with `GET/PATCH /v1/admin/flags` (see README "Cross-package gaps").
 */
export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  environments: ('development' | 'staging' | 'production')[];
  rolloutPct: number;
  enabled: boolean;
  updatedAt: string;
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const DEFAULT_FLAGS: FeatureFlag[] = [
  { key: 'ai-director-voice', name: 'AI Director voice input', description: 'Enables the mic button in the Studio AI Director command bar.', environments: ['development', 'staging', 'production'], rolloutPct: 100, enabled: true, updatedAt: daysAgo(3) },
  { key: 'worldforge-realworld-import', name: 'WorldForge real-world import', description: 'Enables geo-anchored WorldForge generation from lat/lon + radius.', environments: ['development', 'staging'], rolloutPct: 25, enabled: true, updatedAt: daysAgo(1) },
  { key: 'marketplace-3d-globe', name: 'Marketplace 3D discovery globe', description: 'Renders the spatial discovery map as an interactive 3D globe instead of a tree list.', environments: ['development', 'staging', 'production'], rolloutPct: 60, enabled: true, updatedAt: daysAgo(6) },
  { key: 'creator-payout-instant', name: 'Instant creator payouts', description: 'Allows eligible creators to request same-day payouts instead of the weekly batch.', environments: ['development'], rolloutPct: 5, enabled: false, updatedAt: daysAgo(14) },
  { key: 'npc-long-term-memory', name: 'NPC long-term memory', description: 'Persists NPC conversational memory across sessions (increases AI usage costs).', environments: ['development', 'staging'], rolloutPct: 10, enabled: false, updatedAt: daysAgo(9) },
  { key: 'moderation-ai-auto-resolve', name: 'AI auto-resolve low-severity cases', description: 'Lets the moderation pipeline auto-approve LOW severity, high-confidence AI verdicts without human review.', environments: ['production'], rolloutPct: 100, enabled: false, updatedAt: daysAgo(2) },
  { key: 'fraud-realtime-payout-hold', name: 'Real-time payout auto-hold', description: 'Automatically holds a creator payout the instant a CRITICAL fraud signal fires.', environments: ['staging', 'production'], rolloutPct: 100, enabled: true, updatedAt: daysAgo(1) },
  { key: 'unreal-plugin-beta', name: 'Unreal plugin beta channel', description: 'Surfaces the Unreal plugin download in the developer portal SDK pages ahead of GA.', environments: ['development', 'staging'], rolloutPct: 100, enabled: true, updatedAt: daysAgo(5) },
];

const STORAGE_KEY = 'gw_admin_feature_flags_v1';

export function loadFlags(): FeatureFlag[] {
  if (typeof window === 'undefined') return DEFAULT_FLAGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FLAGS;
    const stored = JSON.parse(raw) as FeatureFlag[];
    const byKey = new Map(stored.map((f) => [f.key, f]));
    // Merge so newly added default flags still show up after an app update.
    return DEFAULT_FLAGS.map((f) => byKey.get(f.key) ?? f);
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function saveFlags(flags: FeatureFlag[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}
