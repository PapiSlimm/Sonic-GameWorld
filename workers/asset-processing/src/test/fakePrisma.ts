// Minimal in-memory PrismaLike double, scoped to the 4 models this worker touches
// (assetVersion, asset, assetVariantFile, assetPassport). Mirrors the shape (and a few of the
// operators) of services/api's src/test/fakePrisma.ts, but kept small and local since workers
// cannot import another package's test-only internals across the workspace boundary.
import type { PrismaLike } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createFakePrisma(): PrismaLike & {
  seedAsset(row: Partial<Row> & { id: string }): void;
  seedVersion(row: Partial<Row> & { id: string; assetId: string }): void;
  seedPassport(row: Partial<Row> & { assetId: string }): void;
  getAsset(id: string): Row | undefined;
  getVersion(id: string): Row | undefined;
  getVariantFiles(): Row[];
} {
  const assets = new Map<string, Row>();
  const versions = new Map<string, Row>();
  const variantFiles = new Map<string, Row>();
  const passports = new Map<string, Row>();

  return {
    assetVersion: {
      async findUnique({ where }: { where: { id: string } }) {
        return versions.get(where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const existing = versions.get(where.id);
        if (!existing) throw new Error(`fakePrisma.assetVersion.update: no row ${where.id}`);
        const merged = { ...existing, ...data };
        versions.set(where.id, merged);
        return merged;
      },
    },
    asset: {
      async findUnique({ where }: { where: { id: string } }) {
        return assets.get(where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const existing = assets.get(where.id);
        if (!existing) throw new Error(`fakePrisma.asset.update: no row ${where.id}`);
        const merged = { ...existing, ...data };
        assets.set(where.id, merged);
        return merged;
      },
    },
    assetVariantFile: {
      async upsert({ where, create, update }: { where: { versionId_variant: { versionId: string; variant: string } }; create: Row; update: Row }) {
        const key = `${where.versionId_variant.versionId}:${where.versionId_variant.variant}`;
        const existing = variantFiles.get(key);
        const merged = existing ? { ...existing, ...update } : { id: genId('avf'), ...create };
        variantFiles.set(key, merged);
        return merged;
      },
      async findMany({ where }: { where?: { versionId?: string } } = {}) {
        return [...variantFiles.values()].filter((r) => !where?.versionId || r.versionId === where.versionId);
      },
    },
    assetPassport: {
      async findUnique({ where }: { where: { assetId: string } }) {
        return passports.get(where.assetId) ?? null;
      },
    },
    seedAsset(row) {
      assets.set(row.id, { tags: [], ...row });
    },
    seedVersion(row) {
      versions.set(row.id, { pipeline: [], status: 'PROCESSING', ...row });
    },
    seedPassport(row) {
      passports.set(row.assetId, { id: genId('pass'), ...row });
    },
    getAsset(id) {
      return assets.get(id);
    },
    getVersion(id) {
      return versions.get(id);
    },
    getVariantFiles() {
      return [...variantFiles.values()];
    },
  };
}
