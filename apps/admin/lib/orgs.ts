import type { Organization, OrgMember, PlanTier, Role } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

export interface AdminOrgMember extends OrgMember {
  handle: string;
  displayName: string;
}

export interface AdminOrg extends Organization {
  memberCount: number;
  members: AdminOrgMember[];
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const DEMO_ORGS: AdminOrg[] = [
  {
    id: 'org_2001', name: 'Northstar Interactive', slug: 'northstar-interactive', tier: 'STUDIO', ownerId: 'user_1001',
    logoUrl: null, createdAt: daysAgo(410), updatedAt: daysAgo(2), memberCount: 8,
    members: [
      { userId: 'user_1001', orgId: 'org_2001', role: 'owner', joinedAt: daysAgo(410), handle: 'ariachen', displayName: 'Aria Chen' },
      { userId: 'user_1010', orgId: 'org_2001', role: 'editor', joinedAt: daysAgo(300), handle: 'sofiam', displayName: 'Sofia Marchetti' },
    ],
  },
  {
    id: 'org_2002', name: 'Voltframe Studios', slug: 'voltframe-studios', tier: 'PRO', ownerId: 'user_1003',
    logoUrl: null, createdAt: daysAgo(300), updatedAt: daysAgo(5), memberCount: 3,
    members: [
      { userId: 'user_1003', orgId: 'org_2002', role: 'owner', joinedAt: daysAgo(300), handle: 'mirao', displayName: 'Mira Okafor' },
      { userId: 'user_1012', orgId: 'org_2002', role: 'viewer', joinedAt: daysAgo(150), handle: 'lenah', displayName: 'Lena Hartwig' },
    ],
  },
  {
    id: 'org_2003', name: 'Duskgate Collective', slug: 'duskgate-collective', tier: 'ENTERPRISE', ownerId: 'user_1005',
    logoUrl: null, createdAt: daysAgo(560), updatedAt: daysAgo(30), memberCount: 22,
    members: [{ userId: 'user_1005', orgId: 'org_2003', role: 'admin', joinedAt: daysAgo(560), handle: 'noahb', displayName: 'Noah Blackwood' }],
  },
  {
    id: 'org_2004', name: 'Stormline Games', slug: 'stormline-games', tier: 'PRO', ownerId: 'user_1008',
    logoUrl: null, createdAt: daysAgo(260), updatedAt: daysAgo(15), memberCount: 5,
    members: [{ userId: 'user_1008', orgId: 'org_2004', role: 'owner', joinedAt: daysAgo(260), handle: 'yukit', displayName: 'Yuki Tanaka' }],
  },
];

export function searchDemoOrgs(query: string, tier?: string): AdminOrg[] {
  const q = query.trim().toLowerCase();
  return DEMO_ORGS.filter((o) => {
    const matchesQuery = !q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
    const matchesTier = !tier || o.tier === tier;
    return matchesQuery && matchesTier;
  });
}

export async function tryFetchOrgById(id: string): Promise<Organization | null> {
  try {
    return await getClient().orgs.get(id);
  } catch {
    return null;
  }
}

/** Real endpoint: `PATCH /v1/orgs/:id/members/:userId` — used for org member role edits. */
export async function updateOrgMemberRole(orgId: string, userId: string, role: Role): Promise<OrgMember> {
  return getClient().orgs.updateMember(orgId, userId, { role });
}

export const ALL_ORG_TIERS: PlanTier[] = ['STARTER', 'CREATOR', 'PRO', 'STUDIO', 'ENTERPRISE'];
