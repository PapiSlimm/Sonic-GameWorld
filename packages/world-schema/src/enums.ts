import { z } from 'zod';

// ---- §4 Plan tiers ----
export const PlanTierSchema = z.enum(['STARTER', 'CREATOR', 'PRO', 'STUDIO', 'ENTERPRISE']);
export type PlanTier = z.infer<typeof PlanTierSchema>;
export const PLAN_TIERS = PlanTierSchema.options;

export interface PlanDefinition {
  priceUsd: number;
  feePct: number;
  /** -1 = unlimited */
  projects: number;
  /** -1 = unlimited */
  assets: number;
  /** -1 = unlimited */
  teamMembers: number;
  /** Short marketing-facing highlights shown on the pricing table (PlanTierTable.tsx); not used
   * for any entitlement check — those stay purely numeric (projects/assets/teamMembers/feePct). */
  features: string[];
}

/** STUDIO and ENTERPRISE were repriced (149->199, 999->1499) to reflect what's actually shipped
 * in those tiers now, beyond the original numeric-limits-only spec (docs/CONTRACTS.md §4): the
 * full RTS/"Global Dominance" real-time-strategy creation toolset (Studio biome + cover-cell
 * authoring, heat/stealth/difficulty/allied-strike systems) and the downloadable offline desktop
 * app (bundled Postgres/MinIO, no internet required to run). STARTER/CREATOR/PRO numbers are
 * unchanged from spec — those tiers get the same new features as a value-add, not a repricing
 * trigger, since desktop/RTS access doesn't gate on tier today (see `features` note above: this
 * list is descriptive, not an entitlement check). */
export const PLAN: Record<PlanTier, PlanDefinition> = {
  STARTER: {
    priceUsd: 0,
    feePct: 20,
    projects: 1,
    assets: 20,
    teamMembers: 1,
    features: ['1 project, 20 assets', 'Browser-based Player & Studio', 'Community support'],
  },
  CREATOR: {
    priceUsd: 19,
    feePct: 15,
    projects: 10,
    assets: 250,
    teamMembers: 1,
    features: ['10 projects, 250 assets', 'Sell on the marketplace', 'Downloadable desktop app'],
  },
  PRO: {
    priceUsd: 49,
    feePct: 12,
    projects: -1,
    assets: 2500,
    teamMembers: 3,
    features: ['Unlimited projects, 2,500 assets', '3-person team', 'Priority asset-processing queue'],
  },
  STUDIO: {
    priceUsd: 199,
    feePct: 10,
    projects: -1,
    assets: -1,
    teamMembers: 15,
    features: [
      'Unlimited projects & assets',
      '15-person team (was 10)',
      'Full RTS / Global Dominance strategy-game creation tools',
      'Desktop app for the whole team',
      'Priority build queue',
    ],
  },
  ENTERPRISE: {
    priceUsd: 1499,
    feePct: 10,
    projects: -1,
    assets: -1,
    teamMembers: -1,
    features: [
      'Everything in Studio, unlimited team',
      'Self-hosted / offline desktop deployment license',
      'Dedicated onboarding & support',
      'Negotiable platform fee',
    ],
  },
};

/** Base marketplace split: creator 85 / platform 15. */
export const BASE_SPLIT = { creatorPct: 85, platformPct: 15 } as const;
export const CURRENCY = 'USD' as const;

/** Compute platform fee & creator earnings in integer cents for a given tier. */
export function splitRevenueCents(grossCents: number, tier: PlanTier): { feeCents: number; creatorCents: number; feePct: number } {
  const feePct = PLAN[tier].feePct;
  const feeCents = Math.round((grossCents * feePct) / 100);
  return { feeCents, creatorCents: grossCents - feeCents, feePct };
}

export function isUnlimited(n: number): boolean {
  return n === -1;
}

// ---- §5 Marketplace taxonomy ----
export const ProductCategorySchema = z.enum([
  'WORLD', 'GAME_KIT', 'SYSTEM', 'AI_AGENT', 'CHARACTER',
  'VEHICLE', 'ENVIRONMENT', 'CINEMATIC', 'MISSION', 'EXPERIENCE',
]);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;
export const PRODUCT_CATEGORIES = ProductCategorySchema.options;

export const GenreSchema = z.enum([
  'FANTASY', 'SCIFI', 'HORROR', 'STRATEGY', 'SHOOTER', 'RACING', 'RPG', 'MMO',
  'SURVIVAL', 'TACTICAL', 'OPEN_WORLD', 'CYBERPUNK', 'OTHER',
]);
export type Genre = z.infer<typeof GenreSchema>;
export const GENRES = GenreSchema.options;

export const EngineTargetSchema = z.enum(['WEB', 'UNITY', 'UNREAL', 'GODOT']);
export type EngineTarget = z.infer<typeof EngineTargetSchema>;
export const ENGINE_TARGETS = EngineTargetSchema.options;

/** Spatial discovery hierarchy: WORLD → CITY → DISTRICT → BUILDING → ROOM → ASSET */
export const SpatialLevelSchema = z.enum(['WORLD', 'CITY', 'DISTRICT', 'BUILDING', 'ROOM', 'ASSET']);
export type SpatialLevel = z.infer<typeof SpatialLevelSchema>;
export const SPATIAL_HIERARCHY = SpatialLevelSchema.options;

// ---- §3 RBAC ----
export const RoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer', 'player', 'moderator', 'platform_admin']);
export type Role = z.infer<typeof RoleSchema>;
export const ROLES = RoleSchema.options;

// ---- §13 asset pipeline ----
export const AssetVariantSchema = z.enum(['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'MOBILE', 'WEB']);
export type AssetVariant = z.infer<typeof AssetVariantSchema>;
export const ASSET_VARIANTS = AssetVariantSchema.options;

export const PIPELINE_STAGES = [
  'UPLOAD', 'MALWARE_SCAN', 'FILE_VALIDATION', 'METADATA_EXTRACTION', 'LICENSE_VALIDATION', '3D_VALIDATION',
  'OPTIMIZATION', 'LOD_GENERATION', 'TEXTURE_OPTIMIZATION', 'THUMBNAILS', 'PREVIEW_BUILD', 'COMPATIBILITY_CHECK',
  'AI_TAGGING', 'QUALITY_SCORE', 'CREATOR_APPROVAL', 'MARKETPLACE',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const PipelineStageSchema = z.enum(PIPELINE_STAGES);

export const MODERATION_STAGES = ['MALWARE', 'AI_SAFETY', 'LICENSE', 'CONTENT_POLICY', 'HUMAN_REVIEW', 'PUBLISH'] as const;
export type ModerationStage = (typeof MODERATION_STAGES)[number];

export const ACCEPTED_UPLOAD_EXTENSIONS = ['FBX', 'GLB', 'GLTF', 'OBJ', 'USD', 'BLEND', 'PNG', 'JPG', 'WAV', 'MP3', 'MP4', 'ZIP'] as const;
export type AcceptedUploadExtension = (typeof ACCEPTED_UPLOAD_EXTENSIONS)[number];

export const QUEUE_NAMES = {
  ASSET_PROCESS: 'asset.process',
  ASSET_THUMBNAIL: 'asset.thumbnail',
  AI_GENERATE: 'ai.generate',
  BUILD_COMPILE: 'build.compile',
  MODERATION_SCAN: 'moderation.scan',
  ANALYTICS_ROLLUP: 'analytics.rollup',
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
