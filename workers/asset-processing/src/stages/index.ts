import type { Stage } from '../types.js';
import { uploadStage } from './01-upload.js';
import { malwareScanStage } from './02-malware-scan.js';
import { fileValidationStage } from './03-file-validation.js';
import { metadataExtractionStage } from './04-metadata-extraction.js';
import { licenseValidationStage } from './05-license-validation.js';
import { threeDValidationStage } from './06-3d-validation.js';
import { optimizationStage } from './07-optimization.js';
import { lodGenerationStage } from './08-lod-generation.js';
import { textureOptimizationStage } from './09-texture-optimization.js';
import { thumbnailsStage } from './10-thumbnails.js';
import { previewBuildStage } from './11-preview-build.js';
import { compatibilityCheckStage } from './12-compatibility-check.js';
import { aiTaggingStage } from './13-ai-tagging.js';
import { qualityScoreStage } from './14-quality-score.js';
import { creatorApprovalStage } from './15-creator-approval.js';
import { marketplaceStage } from './16-marketplace.js';

/** Ordered exactly per CONTRACTS.md §13 / world-schema's PIPELINE_STAGES. */
export const PIPELINE: Stage[] = [
  uploadStage,
  malwareScanStage,
  fileValidationStage,
  metadataExtractionStage,
  licenseValidationStage,
  threeDValidationStage,
  optimizationStage,
  lodGenerationStage,
  textureOptimizationStage,
  thumbnailsStage,
  previewBuildStage,
  compatibilityCheckStage,
  aiTaggingStage,
  qualityScoreStage,
  creatorApprovalStage,
  marketplaceStage,
];

export {
  uploadStage,
  malwareScanStage,
  fileValidationStage,
  metadataExtractionStage,
  licenseValidationStage,
  threeDValidationStage,
  optimizationStage,
  lodGenerationStage,
  textureOptimizationStage,
  thumbnailsStage,
  previewBuildStage,
  compatibilityCheckStage,
  aiTaggingStage,
  qualityScoreStage,
  creatorApprovalStage,
  marketplaceStage,
};
