// PaymentProvider interface (§2/§9): Stripe Checkout Sessions when `STRIPE_SECRET_KEY` is set,
// otherwise a MockProvider that auto-succeeds instantly — the same "real vs. mock, chosen by
// config, lazily-imported SDK" shape as creator/payouts.ts's Stripe Connect transfer.
import { randomBytes } from 'node:crypto';
import type Stripe from 'stripe';
import type { AppConfig } from '../../config.js';

export type PaymentProviderName = 'STRIPE' | 'MOCK';

export interface CheckoutRequest {
  orderId: string;
  amountCents: number;
  currency: string;
  buyerEmail?: string;
  productNames: string[];
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  provider: PaymentProviderName;
  /** True when the payment already succeeded synchronously (MockProvider always; Stripe never —
   * Stripe fulfillment happens later via the webhook). */
  immediatePaid: boolean;
  sessionId: string;
  checkoutUrl?: string;
}

export interface SubscriptionCheckoutRequest {
  userId: string;
  tier: string;
  priceCents: number;
  currency: string;
  buyerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface SubscriptionCheckoutResult {
  provider: PaymentProviderName;
  immediateActive: boolean;
  sessionId: string;
  checkoutUrl?: string;
}

export interface RefundRequest {
  paymentRef: string;
  amountCents: number;
  reason?: string;
}

export interface RefundResult {
  provider: PaymentProviderName;
  refunded: boolean;
  refundRef?: string;
  failureReason?: string;
}

export interface PaymentProvider {
  name: PaymentProviderName;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  createSubscriptionCheckout(request: SubscriptionCheckoutRequest): Promise<SubscriptionCheckoutResult>;
  refund(request: RefundRequest): Promise<RefundResult>;
}

// ---- MockProvider: always succeeds, zero external dependencies ----
export const MockProvider: PaymentProvider = {
  name: 'MOCK',
  async createCheckout(request) {
    return { provider: 'MOCK', immediatePaid: true, sessionId: `mock_cs_${request.orderId}_${randomBytes(4).toString('hex')}` };
  },
  async createSubscriptionCheckout(request) {
    return { provider: 'MOCK', immediateActive: true, sessionId: `mock_sub_${request.userId}_${randomBytes(4).toString('hex')}` };
  },
  async refund(request) {
    return { provider: 'MOCK', refunded: true, refundRef: `mock_re_${randomBytes(4).toString('hex')}`, ...(request.reason ? {} : {}) };
  },
};

// ---- StripeProvider: real Checkout Sessions, lazily-imported SDK ----
async function loadStripe(secretKey: string): Promise<Stripe> {
  // No explicit `apiVersion` — this stays pinned to whatever the installed `stripe` SDK major
  // version defaults to, so it never drifts out of sync with that package's own type definitions.
  const { default: StripeCtor } = (await import('stripe')) as unknown as { default: typeof Stripe };
  return new StripeCtor(secretKey);
}

export function createStripeProvider(config: AppConfig): PaymentProvider {
  const secretKey = config.stripe.secretKey;
  return {
    name: 'STRIPE',
    async createCheckout(request) {
      if (!secretKey) return MockProvider.createCheckout(request);
      const stripe = await loadStripe(secretKey);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: request.orderId,
        metadata: { orderId: request.orderId },
        customer_email: request.buyerEmail,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.amountCents,
              product_data: { name: request.productNames.slice(0, 3).join(', ') || 'GameWorld order' },
            },
          },
        ],
      });
      return { provider: 'STRIPE', immediatePaid: false, sessionId: session.id, checkoutUrl: session.url ?? undefined };
    },
    async createSubscriptionCheckout(request) {
      if (!secretKey) return MockProvider.createSubscriptionCheckout(request);
      const stripe = await loadStripe(secretKey);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: request.userId,
        metadata: { userId: request.userId, tier: request.tier },
        customer_email: request.buyerEmail,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: request.priceCents,
              recurring: { interval: 'month' },
              product_data: { name: `Sonic GameWorld ${request.tier} plan` },
            },
          },
        ],
      });
      return { provider: 'STRIPE', immediateActive: false, sessionId: session.id, checkoutUrl: session.url ?? undefined };
    },
    async refund(request) {
      if (!secretKey) return MockProvider.refund(request);
      try {
        const stripe = await loadStripe(secretKey);
        const refund = await stripe.refunds.create({ payment_intent: request.paymentRef, amount: request.amountCents, reason: 'requested_by_customer' });
        return { provider: 'STRIPE', refunded: refund.status !== 'failed', refundRef: refund.id };
      } catch (err) {
        return { provider: 'STRIPE', refunded: false, failureReason: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** Pick the right provider for the environment: Stripe when configured, Mock otherwise. An
 * explicit `override` (used in tests, and available to callers who want to force MOCK/STRIPE) wins. */
export function resolvePaymentProvider(config: AppConfig, override?: PaymentProviderName): PaymentProvider {
  if (override === 'MOCK') return MockProvider;
  if (override === 'STRIPE') return createStripeProvider(config);
  return config.stripe.secretKey ? createStripeProvider(config) : MockProvider;
}

/** Verify + parse a Stripe webhook payload (raw body + `stripe-signature` header). Throws when
 * `STRIPE_WEBHOOK_SECRET` is unset or the signature doesn't verify. */
export async function verifyStripeWebhook(config: AppConfig, rawBody: Buffer | string, signature: string): Promise<Stripe.Event> {
  if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET unset)');
  }
  const stripe = await loadStripe(config.stripe.secretKey);
  return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}
