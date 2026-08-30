import type { EngineTarget, WorldDocument } from '@sonic-gameworld/world-schema';

/** Structural subset of PrismaClient this worker reads/writes. */
export interface PrismaLike {
  worldVersion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
  };
  gameVersion: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: (args: any) => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: (args: any) => Promise<any>;
  };
}

export interface BuildJobPayload {
  gameId: string;
  gameVersionId: string;
  worldId: string;
  /** Fetched via prisma when omitted; pass directly to avoid a round-trip (used by tests / a
   * caller that already has the document loaded, e.g. right after PUT /worlds/:id/document). */
  worldVersionId?: string;
  worldDocument?: WorldDocument;
  engines: EngineTarget[];
  requestedBy?: string;
}

export interface BuildArtifact {
  engine: EngineTarget;
  key: string;
  url: string;
  sizeBytes: number;
  entityCount: number;
  variantCounts: Partial<Record<string, number>>;
}

export interface BuildFailure {
  engine: EngineTarget;
  error: string;
}

export interface BuildResult {
  ok: boolean;
  gameId: string;
  gameVersionId: string;
  worldId: string;
  artifacts: BuildArtifact[];
  failures: BuildFailure[];
}
