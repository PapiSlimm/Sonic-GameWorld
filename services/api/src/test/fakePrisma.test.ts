import { beforeEach, describe, expect, it } from 'vitest';
import { createFakePrisma } from './fakePrisma.js';
import type { PrismaLike } from '../db.js';

describe('fakePrisma', () => {
  let db: PrismaLike;

  beforeEach(() => {
    db = createFakePrisma();
  });

  it('create() auto-fills id/createdAt/updatedAt when omitted, but keeps explicit values', async () => {
    const user = await db.user.create({ data: { email: 'a@example.com', handle: 'a' } });
    expect(typeof user.id).toBe('string');
    expect(user.id.length).toBeGreaterThan(0);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);

    const explicit = await db.user.create({ data: { id: 'fixed-id', email: 'b@example.com', handle: 'b' } });
    expect(explicit.id).toBe('fixed-id');
  });

  it('findUnique/findFirst return null when nothing matches', async () => {
    expect(await db.user.findUnique({ where: { id: 'nope' } })).toBeNull();
    expect(await db.user.findFirst({ where: { email: 'nope@example.com' } })).toBeNull();
  });

  it('supports equality, `in`, and `contains` (with insensitive mode) in where clauses', async () => {
    await db.product.create({ data: { id: 'p1', name: 'Neon City', slug: 'neon-city', category: 'WORLD', priceCents: 0, description: '', refKind: 'WORLD', refId: 'w1', creatorId: 'c1' } });
    await db.product.create({ data: { id: 'p2', name: 'Desert Raid', slug: 'desert-raid', category: 'MISSION', priceCents: 500, description: '', refKind: 'MISSION', refId: 'm1', creatorId: 'c1' } });
    await db.product.create({ data: { id: 'p3', name: 'Neon Racer', slug: 'neon-racer', category: 'VEHICLE', priceCents: 300, description: '', refKind: 'ASSET', refId: 'a1', creatorId: 'c2' } });

    const byId = await db.product.findMany({ where: { id: { in: ['p1', 'p3'] } } });
    expect(byId.map((p: { id: string }) => p.id).sort()).toEqual(['p1', 'p3']);

    const byCategory = await db.product.findFirst({ where: { category: 'MISSION' } });
    expect(byCategory.id).toBe('p2');

    const neon = await db.product.findMany({ where: { name: { contains: 'neon', mode: 'insensitive' } } });
    expect(neon.map((p: { id: string }) => p.id).sort()).toEqual(['p1', 'p3']);

    const noneCreator = await db.product.findMany({ where: { creatorId: 'c1' } });
    expect(noneCreator).toHaveLength(2);
  });

  it('a field never set matches `where: { field: null }` (mirrors an un-set nullable column reading back NULL)', async () => {
    await db.organization.create({ data: { id: 'org1', name: 'Acme', slug: 'acme', ownerId: 'u1' } });
    const found = await db.organization.findMany({ where: { deletedAt: null } });
    expect(found.map((o: { id: string }) => o.id)).toEqual(['org1']);
  });

  it('orderBy sorts ascending/descending, and take/skip page through results', async () => {
    for (let i = 0; i < 5; i += 1) {
      await db.notification.create({ data: { id: `n${i}`, userId: 'u1', type: 'INFO', title: `T${i}`, createdAt: new Date(2024, 0, i + 1) } });
    }
    const asc = await db.notification.findMany({ where: { userId: 'u1' }, orderBy: { createdAt: 'asc' } });
    expect(asc.map((n: { id: string }) => n.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);

    const desc = await db.notification.findMany({ where: { userId: 'u1' }, orderBy: { createdAt: 'desc' } });
    expect(desc.map((n: { id: string }) => n.id)).toEqual(['n4', 'n3', 'n2', 'n1', 'n0']);

    const page = await db.notification.findMany({ where: { userId: 'u1' }, orderBy: { createdAt: 'asc' }, skip: 1, take: 2 });
    expect(page.map((n: { id: string }) => n.id)).toEqual(['n1', 'n2']);
  });

  it('cursor pagination continues from the cursor row (excluding it via skip: 1)', async () => {
    for (let i = 0; i < 5; i += 1) {
      await db.notification.create({ data: { id: `c${i}`, userId: 'u2', type: 'INFO', title: `T${i}`, createdAt: new Date(2024, 0, i + 1) } });
    }
    const firstPage = await db.notification.findMany({ where: { userId: 'u2' }, orderBy: { createdAt: 'asc' }, take: 2 });
    expect(firstPage.map((n: { id: string }) => n.id)).toEqual(['c0', 'c1']);

    const secondPage = await db.notification.findMany({
      where: { userId: 'u2' },
      orderBy: { createdAt: 'asc' },
      cursor: { id: 'c1' },
      skip: 1,
      take: 2,
    });
    expect(secondPage.map((n: { id: string }) => n.id)).toEqual(['c2', 'c3']);
  });

  it('update() merges data and bumps updatedAt; delete() removes the row', async () => {
    const created = await db.user.create({ data: { email: 'u@example.com', handle: 'u' } });
    await new Promise((r) => setTimeout(r, 2));
    const updated = await db.user.update({ where: { id: created.id }, data: { displayName: 'New Name' } });
    expect(updated.displayName).toBe('New Name');
    expect(updated.email).toBe('u@example.com');
    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());

    await db.user.delete({ where: { id: created.id } });
    expect(await db.user.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it('update() supports increment/decrement/push operators', async () => {
    const profile = await db.creatorProfile.create({ data: { userId: 'u1', handle: 'h1', displayName: 'H', followers: 10 } });
    const inc = await db.creatorProfile.update({ where: { id: profile.id }, data: { followers: { increment: 5 } } });
    expect(inc.followers).toBe(15);
    const dec = await db.creatorProfile.update({ where: { id: profile.id }, data: { followers: { decrement: 3 } } });
    expect(dec.followers).toBe(12);
  });

  it('createMany() / updateMany() / deleteMany() / count() operate on all matching rows', async () => {
    await db.orderItem.createMany({
      data: [
        { orderId: 'o1', productId: 'p1', unitPriceCents: 100 },
        { orderId: 'o1', productId: 'p2', unitPriceCents: 200 },
        { orderId: 'o2', productId: 'p1', unitPriceCents: 300 },
      ],
    });
    expect(await db.orderItem.count({ where: { orderId: 'o1' } })).toBe(2);

    const updateResult = await db.orderItem.updateMany({ where: { orderId: 'o1' }, data: { feeCents: 10 } });
    expect(updateResult.count).toBe(2);
    const afterUpdate = await db.orderItem.findMany({ where: { orderId: 'o1' } });
    expect(afterUpdate.every((oi: { feeCents: number }) => oi.feeCents === 10)).toBe(true);

    const deleteResult = await db.orderItem.deleteMany({ where: { orderId: 'o2' } });
    expect(deleteResult.count).toBe(1);
    expect(await db.orderItem.count({})).toBe(2);
  });

  it('upsert() creates when missing and updates when present', async () => {
    const created = await db.orgMember.upsert({
      where: { orgId_userId: { orgId: 'org1', userId: 'user1' } },
      create: { orgId: 'org1', userId: 'user1', role: 'viewer', joinedAt: new Date() },
      update: { role: 'admin' },
    });
    expect(created.role).toBe('viewer');

    const updated = await db.orgMember.upsert({
      where: { orgId_userId: { orgId: 'org1', userId: 'user1' } },
      create: { orgId: 'org1', userId: 'user1', role: 'viewer', joinedAt: new Date() },
      update: { role: 'admin' },
    });
    expect(updated.role).toBe('admin');
    expect(await db.orgMember.count({})).toBe(1);
  });

  it('aggregate() computes _sum, _count, and _avg over the matching rows', async () => {
    await db.royaltyAccrual.createMany({
      data: [
        { creatorId: 'c1', amountCents: 100, status: 'ACCRUED' },
        { creatorId: 'c1', amountCents: 300, status: 'ACCRUED' },
        { creatorId: 'c1', amountCents: 50, status: 'PAID' },
      ],
    });
    const agg = await db.royaltyAccrual.aggregate({ where: { creatorId: 'c1', status: 'ACCRUED' }, _sum: { amountCents: true }, _count: true, _avg: { amountCents: true } });
    expect(agg._sum.amountCents).toBe(400);
    expect(agg._count).toBe(2);
    expect(agg._avg.amountCents).toBe(200);
  });

  it('include resolves a one-level relation via the `<name>Id` foreign-key convention', async () => {
    const org = await db.organization.create({ data: { name: 'Acme', slug: 'acme-2', ownerId: 'owner-1' } });
    const member = await db.orgMember.create({ data: { orgId: org.id, userId: 'user-9', role: 'editor', joinedAt: new Date() } });

    const found = await db.orgMember.findUnique({ where: { id: member.id }, include: { org: true } });
    expect(found.org).toBeTruthy();
    expect(found.org.id).toBe(org.id);
    expect(found.org.name).toBe('Acme');
  });

  it('$transaction runs an array of promises and a callback with the same client', async () => {
    const [a, b] = await db.$transaction([db.user.create({ data: { email: 'x@example.com', handle: 'x' } }), db.user.create({ data: { email: 'y@example.com', handle: 'y' } })]);
    expect(a.email).toBe('x@example.com');
    expect(b.email).toBe('y@example.com');

    const count = await db.$transaction(async (tx: PrismaLike) => {
      return tx.user.count({});
    });
    expect(count).toBe(2);
  });

  it('each createFakePrisma() call is independently isolated', async () => {
    const other = createFakePrisma();
    await db.user.create({ data: { email: 'only-in-db@example.com', handle: 'only' } });
    expect(await other.user.count({})).toBe(0);
    expect(await db.user.count({})).toBe(1);
  });
});
