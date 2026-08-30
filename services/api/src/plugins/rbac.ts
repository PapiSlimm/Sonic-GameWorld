// Roles → permissions map (§3 of CONTRACTS.md). A fastify-plugin so it can be registered
// independently and unit-tested, but the map + hasPermission() are also usable as plain
// functions (e.g. from plugins/auth.ts, or other modules that need a permission check outside
// a request lifecycle).
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Role } from '@prisma/client';
import type { Permission } from '../types.js';

export const ALL_PERMISSIONS: Permission[] = ['world:read', 'world:write', 'world:publish', 'product:write', 'org:admin', 'platform:admin'];

/** Roles → the set of permissions each one grants. Additive: a user's permissions are the union
 * across all of their roles. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['world:read', 'world:write', 'world:publish', 'product:write', 'org:admin'],
  admin: ['world:read', 'world:write', 'world:publish', 'product:write', 'org:admin'],
  editor: ['world:read', 'world:write', 'product:write'],
  viewer: ['world:read'],
  player: ['world:read'],
  moderator: ['world:read'],
  platform_admin: ['world:read', 'world:write', 'world:publish', 'product:write', 'org:admin', 'platform:admin'],
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  return set;
}

export function hasPermission(roles: readonly Role[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}

export function hasRole(roles: readonly Role[], required: readonly Role[]): boolean {
  return required.some((r) => roles.includes(r));
}

// eslint-disable-next-line @typescript-eslint/require-await
async function rbacPlugin(_app: FastifyInstance): Promise<void> {
  // No decorators of its own — plugins/auth.ts builds `fastify.requireRole` / `fastify.requirePermission`
  // on top of the pure helpers above (ROLE_PERMISSIONS, hasPermission, hasRole). This is still
  // registered as a fastify-plugin (rather than a plain import) so RBAC is part of the app's
  // plugin graph and its load order is explicit alongside auth/quotas/pagination.
}

export default fp(rbacPlugin, { name: 'rbac' });
