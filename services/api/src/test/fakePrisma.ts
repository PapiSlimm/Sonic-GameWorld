// Generic in-memory Prisma-like test double. Every model in prisma/schema.prisma gets a delegate
// exposing the same method surface as the real (generated) PrismaClient — findUnique, findFirst,
// findMany, create, createMany, update, updateMany, upsert, delete, deleteMany, count, aggregate,
// groupBy — operating against a plain in-memory Map instead of Postgres.
//
// Scope / conventions (read this before relying on a behavior not listed here):
//  - `where` supports: plain equality (including `null`, which also matches a field that was
//    never set — mirroring how an omitted nullable column reads back as NULL in Postgres),
//    `{ in, notIn, not, equals, gte, lte, gt, lt, contains, startsWith, endsWith, mode:
//    'insensitive' }`, top-level `AND`/`OR`/`NOT`, and Prisma-style compound-unique keys
//    (`{ orgId_userId: { orgId, userId } }` — matched as an AND of the nested fields).
//  - `orderBy` accepts a single `{field: 'asc'|'desc'}` or an array of them (tie-break order).
//  - `cursor` + `skip` + `take` implement real cursor pagination: the cursor row is located in
//    the filtered+sorted result set, then `skip` (default 0) is applied from that position.
//  - `include: { relationName: true }` resolves ONE level via the foreign-key convention
//    `<relationName>Id` on the record — e.g. `include: { user: true }` looks up
//    `record.userId` across every model's store. Reverse (one-to-many) relations are not
//    resolved — query the child model directly instead.
//  - `create()`/`upsert()` auto-fill `id` (if omitted) and `createdAt`/`updatedAt` (if omitted) —
//    the two conventions CONTRACTS.md §10 calls out as universal. No other field is defaulted:
//    if your module relies on a schema-level `@default(...)` for some other field (e.g.
//    `joinedAt`, `active`, `failureCount`), pass it explicitly in the data you write in tests
//    (and it's harmless to pass it explicitly in real route code too — an explicit value simply
//    overrides the same default Postgres would have applied).
//  - `update()`/`updateMany()` support the common scalar mutation operators (`set`, `increment`,
//    `decrement`, `multiply`, `push`) in addition to plain value replacement, and bump
//    `updatedAt` automatically when the record already has one.
//  - `$transaction(array)` runs `Promise.all`; `$transaction(fn)` calls `fn(client)` — there is
//    no real isolation (there's nothing to isolate against in-memory), just the same call shape.
import { randomUUID } from 'node:crypto';
import type { PrismaLike } from '../db.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const MODEL_NAMES = [
  'user', 'organization', 'orgMember', 'apiKey', 'refreshToken', 'creatorProfile',
  'product', 'productVersion', 'productLicense', 'review', 'wishlistItem', 'cart', 'cartItem', 'coupon',
  'order', 'orderItem',
  'world', 'worldVersion', 'worldSnapshot', 'worldRegion',
  'game', 'gameVersion', 'gameSession', 'gameSessionPlayer', 'gameSave', 'leaderboardEntry',
  'asset', 'assetVersion', 'assetVariantFile', 'assetPassport',
  'nPC', 'nPCConversation', 'nPCMessage',
  'mission',
  'royaltyAccrual', 'payout', 'subscription', 'payment',
  'analyticsEvent', 'searchDocument', 'aIExecution', 'aIUsage',
  'notification', 'moderationItem', 'webhook', 'integration', 'gameServer', 'liveEvent', 'matchmakeTicket',
] as const;

export type ModelName = (typeof MODEL_NAMES)[number];

const OPERATOR_KEYS = new Set(['equals', 'in', 'notIn', 'contains', 'startsWith', 'endsWith', 'gte', 'lte', 'gt', 'lt', 'not', 'mode']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function toComparable(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  return v as number;
}

function normalize(v: unknown): unknown {
  return v === undefined ? null : v;
}

function matchesOperators(actual: unknown, ops: Record<string, unknown>): boolean {
  const a = normalize(actual);
  for (const [op, val] of Object.entries(ops)) {
    switch (op) {
      case 'equals':
        if (a !== normalize(val)) return false;
        break;
      case 'in':
        if (!Array.isArray(val) || !val.some((v) => normalize(v) === a)) return false;
        break;
      case 'notIn':
        if (Array.isArray(val) && val.some((v) => normalize(v) === a)) return false;
        break;
      case 'not':
        if (a === normalize(val)) return false;
        break;
      case 'gte':
        if (!(toComparable(actual) >= toComparable(val))) return false;
        break;
      case 'lte':
        if (!(toComparable(actual) <= toComparable(val))) return false;
        break;
      case 'gt':
        if (!(toComparable(actual) > toComparable(val))) return false;
        break;
      case 'lt':
        if (!(toComparable(actual) < toComparable(val))) return false;
        break;
      case 'contains':
      case 'startsWith':
      case 'endsWith': {
        const insensitive = ops.mode === 'insensitive';
        const hay = insensitive ? String(actual ?? '').toLowerCase() : String(actual ?? '');
        const needle = insensitive ? String(val).toLowerCase() : String(val);
        if (op === 'contains' && !hay.includes(needle)) return false;
        if (op === 'startsWith' && !hay.startsWith(needle)) return false;
        if (op === 'endsWith' && !hay.endsWith(needle)) return false;
        break;
      }
      case 'mode':
        break; // consumed alongside contains/startsWith/endsWith
      default:
        break;
    }
  }
  return true;
}

function plainEquals(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  }
  return actual === expected;
}

export function matchesWhere(record: Row, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(expected)) {
      if (!expected.every((w) => matchesWhere(record, w as Record<string, unknown>))) return false;
      continue;
    }
    if (key === 'OR' && Array.isArray(expected)) {
      if (!expected.some((w) => matchesWhere(record, w as Record<string, unknown>))) return false;
      continue;
    }
    if (key === 'NOT' && isPlainObject(expected)) {
      if (matchesWhere(record, expected)) return false;
      continue;
    }
    if (expected === null) {
      if (!(record[key] === null || record[key] === undefined)) return false;
      continue;
    }
    if (expected instanceof Date) {
      if (toComparable(record[key]) !== toComparable(expected)) return false;
      continue;
    }
    if (Array.isArray(expected)) {
      if (!plainEquals(record[key], expected)) return false;
      continue;
    }
    if (isPlainObject(expected)) {
      const keys = Object.keys(expected);
      const isOperatorObject = keys.length > 0 && keys.every((k) => OPERATOR_KEYS.has(k));
      if (isOperatorObject) {
        if (!matchesOperators(record[key], expected)) return false;
      } else {
        // Compound-unique key, e.g. `{ orgId_userId: { orgId, userId } }` — AND the subfields.
        if (!Object.entries(expected).every(([subKey, subVal]) => matchesWhere(record, { [subKey]: subVal }))) return false;
      }
      continue;
    }
    if (record[key] !== expected) return false;
  }
  return true;
}

type OrderSpec = Record<string, 'asc' | 'desc'>;

function compareBy(orderBy?: OrderSpec | OrderSpec[]): (a: Row, b: Row) => number {
  const specs = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return (a, b) => {
    for (const spec of specs) {
      for (const [field, dir] of Object.entries(spec)) {
        const av = toComparable(a[field]);
        const bv = toComparable(b[field]);
        if (av < bv) return dir === 'desc' ? 1 : -1;
        if (av > bv) return dir === 'desc' ? -1 : 1;
      }
    }
    return 0;
  };
}

function genId(): string {
  return `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function applyCreateDefaults(data: Record<string, unknown> = {}): Row {
  const now = new Date();
  const record: Row = { ...data };
  if (record.id === undefined) record.id = genId();
  if (record.createdAt === undefined) record.createdAt = now;
  if (record.updatedAt === undefined) record.updatedAt = now;
  return record;
}

function applyUpdateData(existing: Row, data: Record<string, unknown> = {}): Row {
  const merged: Row = { ...existing };
  for (const [key, value] of Object.entries(data)) {
    if (isPlainObject(value)) {
      if ('set' in value) {
        merged[key] = value.set;
        continue;
      }
      if ('increment' in value) {
        merged[key] = (Number(merged[key]) || 0) + Number(value.increment);
        continue;
      }
      if ('decrement' in value) {
        merged[key] = (Number(merged[key]) || 0) - Number(value.decrement);
        continue;
      }
      if ('multiply' in value) {
        merged[key] = (Number(merged[key]) || 0) * Number(value.multiply);
        continue;
      }
      if ('push' in value) {
        merged[key] = [...(Array.isArray(merged[key]) ? (merged[key] as unknown[]) : []), value.push];
        continue;
      }
    }
    merged[key] = value;
  }
  if ('updatedAt' in existing && !('updatedAt' in data)) merged.updatedAt = new Date();
  return merged;
}

class ModelStore {
  readonly records = new Map<string, Row>();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDelegate(modelName: ModelName, stores: Record<ModelName, ModelStore>): any {
  const store = stores[modelName];

  function resolveInclude(record: Row | null, include?: Record<string, boolean>): Row | null {
    if (!record || !include) return record;
    const result: Row = { ...record };
    for (const [key, wanted] of Object.entries(include)) {
      if (!wanted) continue;
      const fkValue = record[`${key}Id`];
      if (fkValue === undefined || fkValue === null) {
        result[key] = null;
        continue;
      }
      let found: Row | null = null;
      for (const other of Object.values(stores)) {
        const match = other.records.get(fkValue);
        if (match) {
          found = match;
          break;
        }
      }
      result[key] = found;
    }
    return result;
  }

  function findManyRaw(args: { where?: Record<string, unknown>; orderBy?: OrderSpec | OrderSpec[]; take?: number; skip?: number; cursor?: Record<string, unknown> } = {}): Row[] {
    let items = [...store.records.values()].filter((r) => matchesWhere(r, args.where));
    items = args.orderBy ? [...items].sort(compareBy(args.orderBy)) : items;

    let startIndex = 0;
    if (args.cursor) {
      const idx = items.findIndex((r) => matchesWhere(r, args.cursor));
      startIndex = idx === -1 ? items.length : idx + (args.skip ?? 0);
    } else if (typeof args.skip === 'number') {
      startIndex = args.skip;
    }
    let sliced = items.slice(startIndex);
    if (typeof args.take === 'number') sliced = args.take >= 0 ? sliced.slice(0, args.take) : sliced.slice(args.take);
    return sliced;
  }

  return {
    async findUnique(args: { where?: Record<string, unknown>; include?: Record<string, boolean> } = {}) {
      return resolveInclude(findManyRaw({ where: args.where })[0] ?? null, args.include);
    },
    async findUniqueOrThrow(args: Record<string, unknown> = {}) {
      const record = await this.findUnique(args);
      if (!record) throw new Error(`[fakePrisma] ${modelName}.findUniqueOrThrow: no matching record`);
      return record;
    },
    async findFirst(args: Record<string, unknown> = {}) {
      return resolveInclude(findManyRaw(args)[0] ?? null, args.include as Record<string, boolean> | undefined);
    },
    async findFirstOrThrow(args: Record<string, unknown> = {}) {
      const record = await this.findFirst(args);
      if (!record) throw new Error(`[fakePrisma] ${modelName}.findFirstOrThrow: no matching record`);
      return record;
    },
    async findMany(args: Record<string, unknown> = {}) {
      return findManyRaw(args).map((r) => resolveInclude(r, args.include as Record<string, boolean> | undefined));
    },
    async create(args: { data?: Record<string, unknown>; include?: Record<string, boolean> }) {
      const record = applyCreateDefaults(args.data);
      store.records.set(record.id, record);
      return resolveInclude(record, args.include);
    },
    async createMany(args: { data: Record<string, unknown> | Record<string, unknown>[]; skipDuplicates?: boolean }) {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      let count = 0;
      for (const d of rows) {
        const record = applyCreateDefaults(d);
        if (args.skipDuplicates && store.records.has(record.id)) continue;
        store.records.set(record.id, record);
        count += 1;
      }
      return { count };
    },
    async createManyAndReturn(args: { data: Record<string, unknown> | Record<string, unknown>[] }) {
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      const created: Row[] = [];
      for (const d of rows) {
        const record = applyCreateDefaults(d);
        store.records.set(record.id, record);
        created.push(record);
      }
      return created;
    },
    async update(args: { where: Record<string, unknown>; data: Record<string, unknown>; include?: Record<string, boolean> }) {
      const existing = findManyRaw({ where: args.where })[0];
      if (!existing) throw new Error(`[fakePrisma] ${modelName}.update: no record matches where=${JSON.stringify(args.where)}`);
      const merged = applyUpdateData(existing, args.data);
      store.records.set(existing.id, merged);
      return resolveInclude(merged, args.include);
    },
    async updateMany(args: { where?: Record<string, unknown>; data: Record<string, unknown> }) {
      const items = findManyRaw({ where: args.where });
      for (const existing of items) store.records.set(existing.id, applyUpdateData(existing, args.data));
      return { count: items.length };
    },
    async updateManyAndReturn(args: { where?: Record<string, unknown>; data: Record<string, unknown> }) {
      const items = findManyRaw({ where: args.where });
      const updated: Row[] = [];
      for (const existing of items) {
        const merged = applyUpdateData(existing, args.data);
        store.records.set(existing.id, merged);
        updated.push(merged);
      }
      return updated;
    },
    async upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown>; include?: Record<string, boolean> }) {
      const existing = findManyRaw({ where: args.where })[0];
      if (existing) {
        const merged = applyUpdateData(existing, args.update);
        store.records.set(existing.id, merged);
        return resolveInclude(merged, args.include);
      }
      const record = applyCreateDefaults(args.create);
      store.records.set(record.id, record);
      return resolveInclude(record, args.include);
    },
    async delete(args: { where: Record<string, unknown> }) {
      const existing = findManyRaw({ where: args.where })[0];
      if (!existing) throw new Error(`[fakePrisma] ${modelName}.delete: no record matches where=${JSON.stringify(args.where)}`);
      store.records.delete(existing.id);
      return existing;
    },
    async deleteMany(args: { where?: Record<string, unknown> } = {}) {
      const items = findManyRaw({ where: args.where });
      for (const r of items) store.records.delete(r.id);
      return { count: items.length };
    },
    async count(args: { where?: Record<string, unknown> } = {}) {
      return findManyRaw({ where: args.where }).length;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async aggregate(args: Record<string, any> = {}) {
      const items = findManyRaw({ where: args.where });
      const result: Row = {};
      if (args._count) {
        result._count =
          args._count === true
            ? items.length
            : Object.fromEntries(Object.keys(args._count).map((f) => [f, items.filter((r) => r[f] !== undefined && r[f] !== null).length]));
      }
      if (args._sum) {
        result._sum = Object.fromEntries(Object.keys(args._sum).map((f) => [f, items.reduce((s, r) => s + (Number(r[f]) || 0), 0)]));
      }
      if (args._avg) {
        result._avg = Object.fromEntries(
          Object.keys(args._avg).map((f) => {
            const nums = items.map((r) => Number(r[f])).filter((n) => !Number.isNaN(n));
            return [f, nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null];
          }),
        );
      }
      if (args._min) {
        result._min = Object.fromEntries(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.keys(args._min).map((f) => [f, items.length > 0 ? items.reduce((m: any, r) => (m === undefined || r[f] < m ? r[f] : m), undefined) : null]),
        );
      }
      if (args._max) {
        result._max = Object.fromEntries(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Object.keys(args._max).map((f) => [f, items.length > 0 ? items.reduce((m: any, r) => (m === undefined || r[f] > m ? r[f] : m), undefined) : null]),
        );
      }
      return result;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async groupBy(args: Record<string, any> = {}) {
      const items = findManyRaw({ where: args.where });
      const byKeys: string[] = Array.isArray(args.by) ? args.by : [args.by];
      const groups = new Map<string, Row[]>();
      for (const r of items) {
        const key = JSON.stringify(byKeys.map((k) => r[k]));
        const arr = groups.get(key) ?? [];
        arr.push(r);
        groups.set(key, arr);
      }
      return [...groups.values()].map((groupItems) => {
        const row: Row = {};
        for (const k of byKeys) row[k] = groupItems[0]?.[k];
        if (args._count) row._count = args._count === true ? groupItems.length : Object.fromEntries(Object.keys(args._count).map((f) => [f, groupItems.length]));
        if (args._sum) row._sum = Object.fromEntries(Object.keys(args._sum).map((f) => [f, groupItems.reduce((s: number, r: Row) => s + (Number(r[f]) || 0), 0)]));
        return row;
      });
    },
  };
}

/** Build a fresh, isolated fake Prisma client (own in-memory stores per call). */
export function createFakePrisma(): PrismaLike {
  const stores = Object.fromEntries(MODEL_NAMES.map((name) => [name, new ModelStore()])) as Record<ModelName, ModelStore>;
  const delegates = Object.fromEntries(MODEL_NAMES.map((name) => [name, createDelegate(name, stores)]));

  const client = {
    ...delegates,
    async $connect() {},
    async $disconnect() {},
    async $queryRaw() {
      return [];
    },
    async $queryRawUnsafe() {
      return [];
    },
    async $executeRaw() {
      return 0;
    },
    async $executeRawUnsafe() {
      return 0;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $transaction(arg: any) {
      if (Array.isArray(arg)) return Promise.all(arg);
      if (typeof arg === 'function') return arg(client);
      return arg;
    },
    $on() {},
    $use() {},
    $extends() {
      return client;
    },
  };

  return client as unknown as PrismaLike;
}
