// Role -> AIPermission grants for the AI tool pipeline.
//
// This is deliberately separate from `src/plugins/rbac.ts`'s `ROLE_PERMISSIONS` map: that one is
// typed against the app-wide `Permission` union (`world:read|world:write|world:publish|
// product:write|org:admin|platform:admin`), while every AI tool's `permission` field is an
// `AIPermission` (world-schema/ai-tools.ts) — a materially larger vocabulary (`asset:write`,
// `npc:write`, `mission:write`, `camera:write`, `ai:generate`, `analytics:read`, `playtest:run`,
// ...). Editing `plugins/rbac.ts` to widen `Permission` is out of scope for this module (shared
// file, other agents depend on its exact shape), so the AI pipeline enforces its own mapping here
// instead of `app.requirePermission(...)`.
import type { AIPermission } from '@sonic-gameworld/ai-sdk';
import type { Role } from '@prisma/client';
import type { AuthContext } from '../../types.js';

const READ_ONLY: AIPermission[] = ['world:read', 'asset:read', 'analytics:read'];

const BUILDER_SET: AIPermission[] = [
  'world:read',
  'world:write',
  'asset:read',
  'asset:write',
  'npc:write',
  'mission:write',
  'camera:write',
  'ai:generate',
  'analytics:read',
  'playtest:run',
];

const ALL_AI_PERMISSIONS: AIPermission[] = [
  'world:read',
  'world:write',
  'world:publish',
  'asset:read',
  'asset:write',
  'asset:publish',
  'npc:write',
  'mission:write',
  'camera:write',
  'ai:generate',
  'analytics:read',
  'playtest:run',
];

/** Roles -> the AIPermission set each one grants. Additive across a user's roles. */
export const AI_ROLE_PERMISSIONS: Record<Role, AIPermission[]> = {
  owner: ALL_AI_PERMISSIONS,
  admin: ALL_AI_PERMISSIONS,
  platform_admin: ALL_AI_PERMISSIONS,
  editor: BUILDER_SET,
  viewer: READ_ONLY,
  player: ['world:read'],
  moderator: READ_ONLY,
};

export function aiPermissionsForRoles(roles: readonly Role[]): Set<AIPermission> {
  const set = new Set<AIPermission>();
  for (const role of roles) {
    for (const perm of AI_ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  return set;
}

export function hasAIPermission(roles: readonly Role[], permission: AIPermission): boolean {
  return aiPermissionsForRoles(roles).has(permission);
}

// -------------------------------------------------------------------------------------------
// Ownership-aware fallback.
//
// Every other content-mutation route in this service (worlds/npcs/missions' POST/PATCH/DELETE
// handlers, `POST /worlds` itself) authorizes by *ownership* (or org membership), not by the
// global `Role` — `player` is the default `Role` stamped on every account by `/auth/dev` and
// `/auth/firebase` (see `modules/auth/index.ts`), and nothing in this codebase currently elevates
// it. Read literally, `AI_ROLE_PERMISSIONS.player` (`world:read` only) would make every AI tool
// beyond read-only queries permanently unusable for the overwhelming majority of accounts,
// including a creator building in a world they own outright — strictly *more* restrictive than
// just using the plain REST endpoints, which is backwards for a feature meant to be an
// alternative way to drive the same edits. `Role` here is better read as a collaboration-tier
// signal for a world/org a user does *not* own (an invited `editor`/`viewer`), not a ceiling on
// what an unelevated owner can do to their own things.
//
// So: a still-default (`player`, or no roles at all) user gets the FULL AI permission set for a
// world they own (or share an org with) — matching what they could already do by calling the
// underlying REST routes directly — while an explicitly assigned role (`viewer`, `moderator`,
// `editor`, ...) always governs, even for a world that same user happens to own (a deliberately
// downgraded/collaboration session should stay downgraded). `world: null` (generating a *new*
// world that doesn't exist yet, e.g. `create_world`) is treated as trivially "theirs" the same
// way `POST /worlds` requires no ownership check for a brand-new row.
const DEFAULT_ROLE: Role = 'player';

function isUnelevated(roles: readonly Role[]): boolean {
  return roles.length === 0 || roles.every((r) => r === DEFAULT_ROLE);
}

export interface OwnableWorld {
  ownerId: string;
  orgId: string | null;
}

function ownsWorld(world: OwnableWorld, user: Pick<AuthContext, 'userId' | 'orgId'>): boolean {
  if (world.ownerId === user.userId) return true;
  return Boolean(world.orgId) && Boolean(user.orgId) && world.orgId === user.orgId;
}

/** The AIPermissions a user effectively has for a given world (or `null` when creating a brand
 * new one): their role-derived set, widened to every AIPermission when they're still on the
 * default `player`/no-role baseline AND they own (or share an org with) the world in question. */
export function effectiveAIPermissions(user: AuthContext, world: OwnableWorld | null): Set<AIPermission> {
  const base = aiPermissionsForRoles(user.roles);
  const owns = world ? ownsWorld(world, user) : true;
  if (isUnelevated(user.roles) && owns) {
    for (const perm of ALL_AI_PERMISSIONS) base.add(perm);
  }
  return base;
}

export function hasEffectiveAIPermission(user: AuthContext, world: OwnableWorld | null, permission: AIPermission): boolean {
  return effectiveAIPermissions(user, world).has(permission);
}
