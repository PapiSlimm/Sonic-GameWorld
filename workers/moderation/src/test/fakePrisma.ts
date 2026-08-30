import type { PrismaLike } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function genId(): string {
  return `mod_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createFakePrisma(): PrismaLike & { getItem(id: string): Row | undefined; allItems(): Row[] } {
  const items = new Map<string, Row>();
  return {
    moderationItem: {
      async findUnique({ where }: { where: { id: string } }) {
        return items.get(where.id) ?? null;
      },
      async create({ data }: { data: Row }) {
        const record = { id: genId(), createdAt: new Date(), resolvedAt: null, ...data };
        items.set(record.id, record);
        return record;
      },
      async update({ where, data }: { where: { id: string }; data: Row }) {
        const existing = items.get(where.id);
        if (!existing) throw new Error(`fakePrisma.moderationItem.update: no row ${where.id}`);
        const merged = { ...existing, ...data };
        items.set(where.id, merged);
        return merged;
      },
    },
    getItem(id) {
      return items.get(id);
    },
    allItems() {
      return [...items.values()];
    },
  };
}
