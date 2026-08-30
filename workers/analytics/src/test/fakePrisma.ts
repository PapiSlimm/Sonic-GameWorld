// Small in-memory PrismaLike double covering exactly the where-clause shapes queries.ts produces:
// plain equality, `{ in: [...] }`, `{ gte, lt? }` date ranges, `null`, and a top-level `OR` array.
// Not a general Prisma emulator (see services/api's src/test/fakePrisma.ts for that) — just
// enough to exercise this worker's real fetch + aggregate + upsert logic end-to-end in tests.
import type { PrismaLike } from '../types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function matchesCondition(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    const cond = expected as Record<string, unknown>;
    if ('in' in cond) return Array.isArray(cond.in) && cond.in.includes(actual);
    if ('gte' in cond || 'lt' in cond || 'gt' in cond || 'lte' in cond) {
      const a = actual instanceof Date ? actual.getTime() : (actual as number);
      if (a === undefined || a === null) return false;
      if ('gte' in cond && a < (cond.gte as Date).getTime()) return false;
      if ('gt' in cond && a <= (cond.gt as Date).getTime()) return false;
      if ('lt' in cond && a >= (cond.lt as Date).getTime()) return false;
      if ('lte' in cond && a > (cond.lte as Date).getTime()) return false;
      return true;
    }
  }
  return actual === expected;
}

function matchesWhere(row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(expected)) {
      if (!expected.some((sub) => matchesWhere(row, sub as Row))) return false;
      continue;
    }
    if (!matchesCondition(row[key], expected)) return false;
  }
  return true;
}

class Store {
  rows: Row[] = [];
  async findMany(args: { where?: Row } = {}): Promise<Row[]> {
    return this.rows.filter((r) => matchesWhere(r, args.where));
  }
  async count(args: { where?: Row } = {}): Promise<number> {
    return this.rows.filter((r) => matchesWhere(r, args.where)).length;
  }
  async update(args: Row): Promise<Row> {
    const { where, data } = args as { where: Row; data: Row };
    const row = this.rows.find((r) => matchesWhere(r, where));
    if (!row) throw new Error(`fakePrisma: no row matches ${JSON.stringify(where)}`);
    Object.assign(row, data);
    return row;
  }
  seed(rows: Row[]): void {
    this.rows.push(...rows);
  }
}

class UpsertStore {
  rows: Row[] = [];
  constructor(private readonly keyFields: string[]) {}
  private matches(row: Row, key: Row): boolean {
    const target = this.keyFields.length > 1 ? (key[this.keyFields.join('_')] ?? key) : key;
    return this.keyFields.every((f) => {
      const v = target[f];
      const rv = row[f];
      return v instanceof Date && rv instanceof Date ? v.getTime() === rv.getTime() : v === rv;
    });
  }
  async upsert(args: Row): Promise<Row> {
    const { where, create, update } = args as { where: Row; create: Row; update: Row };
    const existing = this.rows.find((r) => this.matches(r, where));
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const row = { ...create };
    this.rows.push(row);
    return row;
  }
}

export function createFakePrisma() {
  const analyticsEvent = new Store();
  const gameSession = new Store();
  const gameSessionPlayer = new Store();
  const order = new Store();
  const orderItem = new Store();
  const product = new Store();
  const review = new Store();
  const productVersion = new Store();
  const assetPassport = new Store();
  const moderationItem = new Store();
  const asset = new Store();
  const creatorProfile = new Store();
  const user = new Store();
  const playerMetric = new UpsertStore(['userId', 'periodStart']);
  const gameMetric = new UpsertStore(['gameId', 'periodStart']);
  const assetMetric = new UpsertStore(['assetId', 'periodStart']);
  const creatorMetric = new UpsertStore(['creatorId', 'periodStart']);
  const marketplaceMetric = new UpsertStore(['periodStart']);

  const prisma: PrismaLike = {
    analyticsEvent,
    gameSession,
    gameSessionPlayer,
    order,
    orderItem,
    product,
    review,
    productVersion,
    assetPassport,
    moderationItem,
    asset,
    creatorProfile,
    user,
    playerMetric,
    gameMetric,
    assetMetric,
    creatorMetric,
    marketplaceMetric,
  };

  return {
    prisma,
    stores: { analyticsEvent, gameSession, gameSessionPlayer, order, orderItem, product, review, productVersion, assetPassport, moderationItem, asset, creatorProfile, user, playerMetric, gameMetric, assetMetric, creatorMetric, marketplaceMetric },
  };
}
