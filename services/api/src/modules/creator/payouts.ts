// Payout execution: a Stripe Connect transfer when STRIPE_SECRET_KEY + the creator's
// stripeAccountId are both present, otherwise MockPayout (always succeeds instantly — good
// enough for dev/test, and keeps the primary path fully functional with zero external config).
import { randomBytes } from 'node:crypto';
import type Stripe from 'stripe';
import type { AppConfig } from '../../config.js';

export interface PayoutResult {
  status: 'SENT' | 'FAILED';
  providerRef?: string;
  failureReason?: string;
}

export interface PayoutRequest {
  payoutId: string;
  creatorId: string;
  amountCents: number;
  currency: string;
  stripeAccountId?: string | null;
}

/** Instant mock payout provider — deterministic success, unique reference per call. */
export function runMockPayout(request: PayoutRequest): PayoutResult {
  return { status: 'SENT', providerRef: `mock_payout_${request.payoutId}_${randomBytes(4).toString('hex')}` };
}

/** Stripe Connect transfer to the creator's connected account. Lazily imports `stripe` so
 * environments without a Stripe key never pay for (or need) the SDK. */
export async function runStripeConnectPayout(config: AppConfig, request: PayoutRequest): Promise<PayoutResult> {
  if (!config.stripe.secretKey) return runMockPayout(request);
  if (!request.stripeAccountId) {
    return { status: 'FAILED', failureReason: 'Creator has no connected Stripe account (stripeAccountId is not set)' };
  }
  try {
    const { default: StripeCtor } = (await import('stripe')) as unknown as { default: typeof Stripe };
    const stripe = new StripeCtor(config.stripe.secretKey);
    const transfer = await stripe.transfers.create({
      amount: request.amountCents,
      currency: request.currency.toLowerCase(),
      destination: request.stripeAccountId,
      transfer_group: request.payoutId,
    });
    return { status: 'SENT', providerRef: transfer.id };
  } catch (err) {
    return { status: 'FAILED', failureReason: err instanceof Error ? err.message : String(err) };
  }
}

/** Pick the right provider for a payout request based on config + creator setup. */
export async function processPayout(config: AppConfig, request: PayoutRequest): Promise<PayoutResult> {
  if (config.stripe.secretKey && request.stripeAccountId) {
    return runStripeConnectPayout(config, request);
  }
  return runMockPayout(request);
}
