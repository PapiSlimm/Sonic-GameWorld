import type { EventBus } from '@sonic-gameworld/events';
import type { LicenseRecord } from '@sonic-gameworld/world-schema';
import type { Logger } from './logger.js';
import type { Storage } from './storage.js';

export type ModerationRefKind = 'ASSET' | 'PRODUCT' | 'WORLD' | 'GAME' | 'REVIEW' | 'USER' | 'NPC';
export type ModerationStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
export type ModerationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const MODERATION_STAGE_NAMES = ['MALWARE', 'AI_SAFETY', 'LICENSE', 'CONTENT_POLICY', 'HUMAN_REVIEW', 'PUBLISH'] as const;
export type ModerationStageName = (typeof MODERATION_STAGE_NAMES)[number];

/** Structural subset of PrismaClient this worker reads/writes. */
export interface PrismaLike {
  moderationItem: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<any>;
  };
}

export interface ModerationContent {
  /** Concatenated user-facing text to scan (title + description, review body, chat message, ...). */
  text?: string;
  fileKey?: string;
  fileName?: string;
}

export interface ModerationJobPayload {
  refKind: ModerationRefKind;
  refId: string;
  /** Who/what triggered this scan — 'AUTO' for a system-triggered scan (e.g. on product publish),
   * or a user id for a user report (mirrors ModerationItem.reporterId). */
  reporterId?: string;
  /** Free-text reason a human reporter gave; system scans can omit this. */
  reason?: string;
  content?: ModerationContent;
  /** License record(s) to validate for ASSET/PRODUCT refs (ingested at publish time). */
  licenses?: LicenseRecord[];
  /** Existing ModerationItem id to resume against (set when a job is re-enqueued after a human
   * resolves the case created at HUMAN_REVIEW). */
  itemId?: string;
  /** Stage index to resume from. Defaults to 0. */
  resumeFromIndex?: number;
  /** Human moderator's verdict, present only on a resume job. */
  resolution?: 'APPROVED' | 'REJECTED';
}

export interface ModerationPipelineData {
  malwareChecked?: boolean;
  safety?: { flagged: boolean; severity: ModerationSeverity; categories: string[]; method: string };
  licenseStatus?: 'GREEN' | 'YELLOW' | 'RED' | 'NOT_APPLICABLE';
  licenseReasons?: string[];
  contentPolicy?: { flagged: boolean; severity: ModerationSeverity; findings: { rule: string; detail: string }[] };
  itemId?: string;
  autoCleared?: boolean;
  finalSeverity?: ModerationSeverity;
}

export interface ModerationPipelineContext {
  job: ModerationJobPayload;
  prisma: PrismaLike;
  bus: EventBus;
  storage: Storage;
  log: Logger;
  anthropicApiKey?: string;
  requireHumanReviewForLowSeverity: boolean;
  data: ModerationPipelineData;
}

export type StageStatus = 'OK' | 'SKIPPED' | 'WAITING' | 'FAILED';

export interface StageResult {
  status: StageStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  error?: string;
}

export interface ModerationStage {
  name: ModerationStageName;
  run(ctx: ModerationPipelineContext): Promise<StageResult>;
}

export interface StageRecord {
  stage: ModerationStageName;
  status: StageStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  error?: string;
}

export interface ModerationRunResult {
  outcome: 'COMPLETED' | 'WAITING' | 'FAILED';
  records: StageRecord[];
  failedAt?: ModerationStageName;
}
