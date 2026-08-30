/** Structural subset of PrismaClient this worker reads/writes. Satisfied by the real generated
 * client (services/api/prisma/schema.prisma) and by hand-rolled fakes in tests. */
export interface PrismaLike {
  asset: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<any>;
  };
}

/** Payload enqueued by worker-asset-processing's THUMBNAILS stage (see its src/stages/10-thumbnails.ts). */
export interface ThumbnailJobPayload {
  assetId: string;
  versionId: string;
  name: string;
  /** Asset.type (MODEL, TEXTURE, AUDIO, ...) or a marketplace category label. */
  category: string;
  polyCount?: number;
  /** Storage key of the source asset — reserved for a future GPU Renderer (see renderer.ts);
   * the current sharp-based card renderer only needs `name`/`category`/`polyCount`. */
  sourceKey?: string;
}

export interface ThumbnailResult {
  key: string;
  url: string;
  sizeBytes: number;
  widthPx: number;
  heightPx: number;
  method: 'CARD' | 'GPU_RENDER';
}
