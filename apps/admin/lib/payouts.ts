import type { Payout } from '@sonic-gameworld/gameworld-sdk';
import { getClient } from './client.js';

/**
 * `Payout.status` covers REQUESTED/PROCESSING/SENT/FAILED/CANCELLED (CONTRACTS §9 creator payouts),
 * but there is no admin-wide payout list/approve/hold route — `creators.listPayouts()` is scoped to
 * the caller's own creator account. This screen is demo-driven; approve/hold actions are staged
 * locally. See README "Cross-package gaps".
 */
export interface AdminPayout extends Payout {
  creatorHandle: string;
  method: 'STRIPE_CONNECT' | 'MANUAL';
  onHold: boolean;
}

/** Best-effort: works only if the admin session happens to also be a creator account. */
export async function tryFetchOwnPayouts(): Promise<Payout[]> {
  const page = await getClient().creators.listPayouts({ limit: 50 });
  return page.items;
}

const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

export const DEMO_PAYOUTS: AdminPayout[] = [
  { id: 'payout_9001', creatorId: 'user_1001', creatorHandle: 'ariachen', amountCents: 482300, currency: 'USD', status: 'REQUESTED', provider: 'stripe_connect', providerRef: null, requestedAt: daysAgo(1), sentAt: null, method: 'STRIPE_CONNECT', onHold: false },
  { id: 'payout_9002', creatorId: 'user_1003', creatorHandle: 'mirao', amountCents: 128900, currency: 'USD', status: 'REQUESTED', provider: 'stripe_connect', providerRef: null, requestedAt: daysAgo(2), sentAt: null, method: 'STRIPE_CONNECT', onHold: true },
  { id: 'payout_9003', creatorId: 'user_1008', creatorHandle: 'yukit', amountCents: 64200, currency: 'USD', status: 'PROCESSING', provider: 'stripe_connect', providerRef: 'tr_2Nabc', requestedAt: daysAgo(3), sentAt: null, method: 'STRIPE_CONNECT', onHold: false },
  { id: 'payout_9004', creatorId: 'user_1010', creatorHandle: 'sofiam', amountCents: 39900, currency: 'USD', status: 'SENT', provider: 'stripe_connect', providerRef: 'tr_2Nxyz', requestedAt: daysAgo(9), sentAt: daysAgo(8), method: 'STRIPE_CONNECT', onHold: false },
  { id: 'payout_9005', creatorId: 'user_1007', creatorHandle: 'jasperlund', amountCents: 15600, currency: 'USD', status: 'FAILED', provider: 'manual', providerRef: null, requestedAt: daysAgo(11), sentAt: null, method: 'MANUAL', onHold: false },
  { id: 'payout_9006', creatorId: 'user_1012', creatorHandle: 'lenah', amountCents: 210500, currency: 'USD', status: 'REQUESTED', provider: 'stripe_connect', providerRef: null, requestedAt: daysAgo(0.5), sentAt: null, method: 'STRIPE_CONNECT', onHold: false },
  { id: 'payout_9007', creatorId: 'user_1005', creatorHandle: 'noahb', amountCents: 890000, currency: 'USD', status: 'REQUESTED', provider: 'stripe_connect', providerRef: null, requestedAt: daysAgo(0.2), sentAt: null, method: 'STRIPE_CONNECT', onHold: true },
  { id: 'payout_9008', creatorId: 'user_1002', creatorHandle: 'devonreyes', amountCents: 55300, currency: 'USD', status: 'CANCELLED', provider: 'stripe_connect', providerRef: null, requestedAt: daysAgo(20), sentAt: null, method: 'STRIPE_CONNECT', onHold: false },
];
