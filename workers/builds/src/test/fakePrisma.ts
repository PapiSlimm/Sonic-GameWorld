import type { PrismaLike } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export function createFakePrisma(): PrismaLike & { seedWorldVersion(row: Row & { id: string }): void; seedGameVersion(row: Row & { id: string }): void; getGameVersion(id: string): Row | undefined } {
  const worldVersions = new Map<string, Row>();
  const gameVersions = new Map<string, Row>();
  return {
    worldVersion: {
      async findUnique({ where }: { where: { id: string } }) {
        return worldVersions.get(where.id) ?? null;
      },
    },
    gameVersion: {
      async findUnique({ where }: { where: { id: string } }) {
        return gameVersions.get(where.id) ?? null;
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const existing = gameVersions.get(where.id);
        if (!existing) throw new Error(`fakePrisma.gameVersion.update: no row ${where.id}`);
        const merged = { ...existing, ...data };
        gameVersions.set(where.id, merged);
        return merged;
      },
    },
    seedWorldVersion(row) {
      worldVersions.set(row.id, row);
    },
    seedGameVersion(row) {
      gameVersions.set(row.id, { buildRef: null, ...row });
    },
    getGameVersion(id) {
      return gameVersions.get(id);
    },
  };
}
