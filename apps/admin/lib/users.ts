import type { Role, User, PlanTier } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

/**
 * There is no `GET /v1/users` (list/search) route in CONTRACTS §9 — only `GET/PATCH /users/:id`.
 * The admin console therefore searches a demo directory client-side, but if the query looks like
 * a real user id it also tries the live `users.get(id)` endpoint and merges the result in.
 */
export interface AdminUser extends User {
  lastActiveAt: string;
  orgName?: string;
}

export async function tryFetchUserById(id: string): Promise<User | null> {
  try {
    return await getClient().users.get(id);
  } catch {
    return null;
  }
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

const TIERS: PlanTier[] = ['STARTER', 'CREATOR', 'PRO', 'STUDIO', 'ENTERPRISE'];
const ROLE_SETS: Role[][] = [['owner'], ['editor'], ['viewer'], ['admin', 'editor'], ['moderator'], ['platform_admin'], ['player']];

const RAW_DEMO_USERS: AdminUser[] = [
  { id: 'user_1001', email: 'aria.chen@northstar.dev', handle: 'ariachen', displayName: 'Aria Chen', tier: 'STUDIO', roles: ['owner'], orgId: 'org_2001', orgName: 'Northstar Interactive', emailVerified: true, createdAt: daysAgo(410), updatedAt: daysAgo(2), lastActiveAt: daysAgo(0) },
  { id: 'user_1002', email: 'devon.reyes@gmail.com', handle: 'devonreyes', displayName: 'Devon Reyes', tier: 'CREATOR', roles: ['editor'], orgId: null, emailVerified: true, createdAt: daysAgo(220), updatedAt: daysAgo(10), lastActiveAt: daysAgo(1) },
  { id: 'user_1003', email: 'mira.okafor@voltframe.io', handle: 'mirao', displayName: 'Mira Okafor', tier: 'PRO', roles: ['editor'], orgId: 'org_2002', orgName: 'Voltframe Studios', emailVerified: true, createdAt: daysAgo(300), updatedAt: daysAgo(5), lastActiveAt: daysAgo(0) },
  { id: 'user_1004', email: 'quickcart22@mailinator.com', handle: 'quickcart22', displayName: 'quickcart22', tier: 'STARTER', roles: ['player'], orgId: null, emailVerified: false, createdAt: daysAgo(40), updatedAt: daysAgo(1), lastActiveAt: daysAgo(0) },
  { id: 'user_1005', email: 'noah.blackwood@duskgate.gg', handle: 'noahb', displayName: 'Noah Blackwood', tier: 'ENTERPRISE', roles: ['admin', 'editor'], orgId: 'org_2003', orgName: 'Duskgate Collective', emailVerified: true, createdAt: daysAgo(560), updatedAt: daysAgo(30), lastActiveAt: daysAgo(3) },
  { id: 'user_1006', email: 'priya.nair@sonicgameworld.com', handle: 'priyan', displayName: 'Priya Nair', tier: 'ENTERPRISE', roles: ['platform_admin'], orgId: null, emailVerified: true, createdAt: daysAgo(700), updatedAt: daysAgo(1), lastActiveAt: daysAgo(0) },
  { id: 'user_1007', email: 'jasper.lund@indiehold.dev', handle: 'jasperlund', displayName: 'Jasper Lund', tier: 'CREATOR', roles: ['moderator'], orgId: null, emailVerified: true, createdAt: daysAgo(180), updatedAt: daysAgo(4), lastActiveAt: daysAgo(0) },
  { id: 'user_1008', email: 'yuki.tanaka@stormline.jp', handle: 'yukit', displayName: 'Yuki Tanaka', tier: 'PRO', roles: ['owner'], orgId: 'org_2004', orgName: 'Stormline Games', emailVerified: true, createdAt: daysAgo(260), updatedAt: daysAgo(15), lastActiveAt: daysAgo(2) },
  { id: 'user_1009', email: 'assetflip@protonmail.com', handle: 'assetflip', displayName: 'assetflip', tier: 'STARTER', roles: ['player'], orgId: null, emailVerified: true, createdAt: daysAgo(15), updatedAt: daysAgo(0), lastActiveAt: daysAgo(0) },
  { id: 'user_1010', email: 'sofia.marchetti@brightloop.studio', handle: 'sofiam', displayName: 'Sofia Marchetti', tier: 'STUDIO', roles: ['editor', 'viewer'], orgId: 'org_2001', orgName: 'Northstar Interactive', emailVerified: true, createdAt: daysAgo(340), updatedAt: daysAgo(7), lastActiveAt: daysAgo(1) },
  { id: 'user_1011', email: 'ben.oduya@freeplay.gg', handle: 'benoduya', displayName: 'Ben Oduya', tier: 'STARTER', roles: ['player'], orgId: null, emailVerified: true, createdAt: daysAgo(60), updatedAt: daysAgo(20), lastActiveAt: daysAgo(12) },
  { id: 'user_1012', email: 'lena.hartwig@voltframe.io', handle: 'lenah', displayName: 'Lena Hartwig', tier: 'PRO', roles: ['viewer'], orgId: 'org_2002', orgName: 'Voltframe Studios', emailVerified: true, createdAt: daysAgo(150), updatedAt: daysAgo(3), lastActiveAt: daysAgo(1) },
];

export const DEMO_USERS: AdminUser[] = RAW_DEMO_USERS.map((u, i) => ({ ...u, roles: u.roles.length ? u.roles : ROLE_SETS[i % ROLE_SETS.length]! }));

export function searchDemoUsers(query: string, tier?: string, role?: string): AdminUser[] {
  const q = query.trim().toLowerCase();
  return DEMO_USERS.filter((u) => {
    const matchesQuery = !q || u.email.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
    const matchesTier = !tier || u.tier === tier;
    const matchesRole = !role || u.roles.includes(role as Role);
    return matchesQuery && matchesTier && matchesRole;
  });
}

export const ALL_TIERS = TIERS;
export const ALL_ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer', 'player', 'moderator', 'platform_admin'];
