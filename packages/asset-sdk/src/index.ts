export const PACKAGE_NAME = '@sonic-gameworld/asset-sdk';

import { createClient, type GameWorldClient, type GameWorldClientOptions } from '@sonic-gameworld/gameworld-sdk';

export type {
  Asset, AssetListQuery, AssetPassport, AssetStatus, AssetType, AssetVariant, AssetVariantInfo,
  AssetVersion, CreateAssetInput, CreateAssetVersionInput, PipelineStageState, PublishAssetInput,
  PublishResult, UploadUrlInput, UploadUrlResult,
} from '@sonic-gameworld/gameworld-sdk';
export { ApiError } from '@sonic-gameworld/gameworld-sdk';

export { uploadAsset, type AssetUploadClient, type UploadableFile, type UploadAssetOptions, type UploadAssetResult } from './upload.js';

/** The `assets` namespace of {@link GameWorldClient} (§9 `assets:`). */
export type AssetClient = GameWorldClient['assets'];

/**
 * Create a scoped client exposing only the asset pipeline routes.
 * Thin wrapper over `@sonic-gameworld/gameworld-sdk`'s `createClient(options).assets`.
 */
export function createAssetClient(options: GameWorldClientOptions): AssetClient {
  return createClient(options).assets;
}

/** Escape hatch to the full client when other SDKs (marketplace/ai) are also needed. */
export function createFullClient(options: GameWorldClientOptions): GameWorldClient {
  return createClient(options);
}
