import type { Document } from '@gltf-transform/core';
import type { Queue } from 'bullmq';
import type { EventBus } from '@sonic-gameworld/events';
import type { AcceptedUploadExtension, AssetVariant, PipelineStage } from '@sonic-gameworld/world-schema';
import type { Logger } from './logger.js';
import type { Storage } from './storage.js';

/** Structural subset of PrismaClient this worker reads/writes. Satisfied by the real generated
 * client (services/api/prisma/schema.prisma) and by hand-rolled fakes in tests. */
export interface PrismaLike {
  assetVersion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<any>;
  };
  asset: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<any>;
  };
  assetVariantFile: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    upsert: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: (args: any) => Promise<any>;
  };
  assetPassport: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
}

export type AssetKind = 'MODEL_3D' | 'IMAGE' | 'AUDIO' | 'VIDEO' | 'ARCHIVE' | 'UNKNOWN';

export interface GltfMetrics {
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  primitiveCount: number;
  triangleCount: number;
  vertexCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  extensionsUsed: string[];
}

export interface VariantFileResult {
  key: string;
  url: string;
  sizeBytes: number;
  format: string;
  polyCount?: number;
  textureMaxPx?: number;
  estimated?: boolean;
}

export interface CompatibilityResult {
  engine: 'WEB' | 'UNITY' | 'UNREAL' | 'GODOT';
  compatible: boolean;
  issues: string[];
}

/** Mutable scratch space threaded through every stage; only the current stage and its
 * successors read/write a given key, but nothing here is private — it's all one job's state. */
export interface PipelineData {
  kind: AssetKind;
  ext: AcceptedUploadExtension | null;
  buffer?: Buffer;
  document?: Document;
  metrics?: GltfMetrics;
  degenerateTriangleRatio?: number;
  missingTextureCount?: number;
  scaleWarning?: string;
  optimizationSavedBytes?: number;
  lodMethod?: 'meshopt' | 'estimated';
  variantDocuments?: Partial<Record<AssetVariant, Document>>;
  variantFiles?: Partial<Record<AssetVariant, VariantFileResult>>;
  previewUrl?: string;
  compatibility?: CompatibilityResult[];
  tags?: string[];
  qualityScore?: number;
  licenseStatus?: 'GREEN' | 'YELLOW' | 'RED';
  licenseReasons?: string[];
  approved?: boolean;
  approvalMethod?: 'auto' | 'manual';
}

export interface JobPayload {
  assetId: string;
  versionId: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  creatorId?: string;
  /** Stage index to resume from (used to continue a job paused at CREATOR_APPROVAL). Defaults to 0. */
  resumeFromIndex?: number;
  /** Force-approve on resume, bypassing AUTO_APPROVE_ASSETS. */
  forceApprove?: boolean;
}

export interface PipelineContext {
  job: JobPayload;
  prisma: PrismaLike;
  bus: EventBus;
  storage: Storage;
  thumbnailQueue: Queue;
  log: Logger;
  autoApproveAssets: boolean;
  data: PipelineData;
}

export type StageStatus = 'OK' | 'SKIPPED' | 'SKIPPED_NO_DECIMATOR' | 'WAITING' | 'FAILED';

export interface StageResult {
  status: StageStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  error?: string;
}

export interface Stage {
  name: PipelineStage;
  run(ctx: PipelineContext): Promise<StageResult>;
}

export interface PipelineRecord {
  stage: PipelineStage;
  status: StageStatus;
  startedAt: string;
  finishedAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  error?: string;
}

export interface PipelineRunResult {
  outcome: 'COMPLETED' | 'WAITING' | 'FAILED';
  records: PipelineRecord[];
  failedAt?: PipelineStage;
}
