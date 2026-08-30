// identity module (§9): users, organizations, org membership.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createEvent } from '@sonic-gameworld/events';
import type { Role } from '@prisma/client';
import { AppError } from '../../errors.js';
import { hasRole } from '../../plugins/rbac.js';
import type { OrganizationRow, OrgMemberRow, UserRow } from '../../types.js';

const UserPatchSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  settings: z.record(z.unknown()).optional(),
});

const CreateOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const AddMemberSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'admin', 'editor', 'viewer', 'player', 'moderator', 'platform_admin']),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['owner', 'admin', 'editor', 'viewer', 'player', 'moderator', 'platform_admin']),
});

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    tier: user.tier,
    roles: user.roles,
    orgId: user.orgId ?? null,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function serializeOrg(org: OrganizationRow) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    tier: org.tier,
    ownerId: org.ownerId,
    logoUrl: org.logoUrl ?? null,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

function serializeMember(member: OrgMemberRow, user?: Pick<UserRow, 'id' | 'handle' | 'displayName' | 'avatarUrl'>) {
  return {
    userId: member.userId,
    orgId: member.orgId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    user: user ? { id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl ?? null } : undefined,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `org-${randomBytes(3).toString('hex')}`;
}

export async function registerIdentityModule(app: FastifyInstance): Promise<void> {
  // ---- Users ----

  app.get('/users/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = await app.db.user.findUnique({ where: { id } });
    if (!user || user.deletedAt) throw AppError.notFound('User', id);
    return serializeUser(user);
  });

  app.patch('/users/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const isSelf = request.user!.userId === id;
    const isPlatformAdmin = hasRole(request.user!.roles, ['platform_admin']);
    if (!isSelf && !isPlatformAdmin) throw AppError.forbidden('You can only edit your own profile');

    const body = UserPatchSchema.parse(request.body);
    if (body.handle) {
      const existing = await app.db.user.findUnique({ where: { handle: body.handle } });
      if (existing && existing.id !== id) throw AppError.conflict(`Handle '${body.handle}' is already taken`);
    }
    const updated = await app.db.user.update({
      where: { id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.handle !== undefined ? { handle: body.handle } : {}),
        ...(body.settings !== undefined ? { settings: body.settings } : {}),
      },
    });
    return serializeUser(updated);
  });

  // ---- Organizations ----

  app.post('/orgs', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = CreateOrgSchema.parse(request.body);
    const slug = body.slug ?? slugify(body.name);
    const existing = await app.db.organization.findUnique({ where: { slug } });
    if (existing) throw AppError.conflict(`Organization slug '${slug}' is already taken`);

    const owner = await app.db.user.findUnique({ where: { id: request.user!.userId } });
    if (!owner) throw AppError.notFound('User');

    const org = await app.db.organization.create({
      data: { name: body.name, slug, ownerId: owner.id, tier: owner.tier },
    });
    await app.db.orgMember.create({ data: { orgId: org.id, userId: owner.id, role: 'owner', joinedAt: new Date() } });
    if (!owner.orgId) {
      await app.db.user.update({ where: { id: owner.id }, data: { orgId: org.id } });
    }
    await app.bus.publish(createEvent({ type: 'ORG_CREATED', payload: { orgId: org.id, ownerId: owner.id, name: org.name } }));
    reply.status(201);
    return serializeOrg(org);
  });

  app.get('/orgs/:id', async (request) => {
    const { id } = request.params as { id: string };
    const org = await app.db.organization.findUnique({ where: { id } });
    if (!org || org.deletedAt) throw AppError.notFound('Organization', id);
    const members = (await app.db.orgMember.findMany({ where: { orgId: id } })) as OrgMemberRow[];
    const users = await Promise.all(members.map((m) => app.db.user.findUnique({ where: { id: m.userId } })));
    return {
      ...serializeOrg(org),
      members: members.map((m, i) => serializeMember(m, users[i] ?? undefined)),
    };
  });

  app.post('/orgs/:id/members', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: orgId } = request.params as { id: string };
    const org = await app.db.organization.findUnique({ where: { id: orgId } });
    if (!org || org.deletedAt) throw AppError.notFound('Organization', orgId);

    const requesterMembership = await app.db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: request.user!.userId } } });
    const isOrgAdmin = requesterMembership && ['owner', 'admin'].includes(requesterMembership.role);
    const isPlatformAdmin = hasRole(request.user!.roles, ['platform_admin']);
    if (!isOrgAdmin && !isPlatformAdmin) throw AppError.forbidden('org:admin permission required');

    const body = AddMemberSchema.parse(request.body);
    let targetUser: UserRow | null = null;
    if (body.userId) targetUser = await app.db.user.findUnique({ where: { id: body.userId } });
    else if (body.email) targetUser = await app.db.user.findUnique({ where: { email: body.email } });
    if (!targetUser) throw AppError.notFound('User');

    await app.quotas.assertTeamQuota(orgId, org.tier);

    const member = await app.db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: targetUser.id } },
      create: { orgId, userId: targetUser.id, role: body.role as Role, joinedAt: new Date() },
      update: { role: body.role as Role },
    });
    reply.status(201);
    return serializeMember(member, targetUser);
  });

  app.patch('/orgs/:id/members/:userId', { preHandler: [app.authenticate] }, async (request) => {
    const { id: orgId, userId } = request.params as { id: string; userId: string };
    const requesterMembership = await app.db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: request.user!.userId } } });
    const isOrgAdmin = requesterMembership && ['owner', 'admin'].includes(requesterMembership.role);
    const isPlatformAdmin = hasRole(request.user!.roles, ['platform_admin']);
    if (!isOrgAdmin && !isPlatformAdmin) throw AppError.forbidden('org:admin permission required');

    const body = UpdateMemberSchema.parse(request.body);
    const existing = await app.db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId } } });
    if (!existing) throw AppError.notFound('Org membership');

    const updated = await app.db.orgMember.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role: body.role as Role },
    });
    return serializeMember(updated);
  });
}
