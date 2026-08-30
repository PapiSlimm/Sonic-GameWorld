# Stripe integration

Sonic GameWorld uses Stripe for two distinct flows, both implemented in `services/api`:

1. **Checkout** (`src/modules/payments`) — one-time product purchases (`POST /orders` ->
   `POST /payments/checkout`) and plan subscriptions (`POST /subscriptions`), both via Stripe
   Checkout Sessions, reconciled by `POST /payments/webhook`.
2. **Connect payouts** (`src/modules/creator/payouts.ts`) — creator revenue-share payouts via
   Stripe Connect transfers (`POST /creators/me/payouts`).

Everything here degrades to a zero-config `MockProvider` / `runMockPayout` when
`STRIPE_SECRET_KEY` is unset, so the whole stack (including `pnpm dev` / `docker compose up`)
works with no Stripe account at all. Set `STRIPE_SECRET_KEY` to switch every code path listed
below over to real Stripe with no other code changes.

This directory documents the two things that live *outside* `services/api`'s TypeScript — the
webhook event contract (what Stripe sends us, and what each event does downstream — see
[`webhook-events.md`](./webhook-events.md)) and the Connect onboarding flow creators go through
before their first payout (see [`connect-onboarding.md`](./connect-onboarding.md)).

## Env vars

| Var | Used by | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Checkout, refunds, Connect transfers | `sk_test_...` / `sk_live_...`. Unset -> `MockProvider`/`runMockPayout` everywhere. |
| `STRIPE_WEBHOOK_SECRET` | `POST /payments/webhook` | `whsec_...` from the Dashboard (or `stripe listen` in dev — see below). Required to verify `stripe-signature`; without it the webhook route falls back to a best-effort unauthenticated parse of `checkout.session.completed` only (dev/mock convenience, never enable this fallback in production by leaving the secret unset). |
| `STRIPE_CONNECT_CLIENT_ID` | Connect OAuth (if you use the OAuth onboarding variant instead of Account Links — see `connect-onboarding.md`) | `ca_...` from **Connect > Settings**. Not required for the Account Links flow this doc recommends. |

## Local development

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then in a separate terminal:

```bash
stripe login
stripe listen --forward-to localhost:4000/v1/payments/webhook
# prints: Ready! Your webhook signing secret is whsec_...
```

Copy that `whsec_...` into `STRIPE_WEBHOOK_SECRET` in your `.env`. Trigger test events with:

```bash
stripe trigger checkout.session.completed
stripe trigger payment_intent.payment_failed
```

Or skip Stripe entirely for local dev — leave `STRIPE_SECRET_KEY` unset and every checkout
"succeeds" instantly via `MockProvider` with no webhook round-trip needed.

## API surface this integration backs (CONTRACTS.md §9)

```
POST /payments/checkout         Create a Stripe Checkout Session for an existing PENDING order
POST /payments/webhook          Stripe webhook receiver (raw body, stripe-signature verified)
POST /subscriptions              Create a Checkout Session for a plan tier subscription
GET  /subscriptions/me           Current subscription status
DELETE /subscriptions/me         Cancel at period end
POST /orders/:id/refund          Issues a Stripe refund via PaymentProvider.refund()
POST /creators/me/payouts        Queue a Stripe Connect transfer to the creator's account
GET  /creators/me/payouts        Payout history
```

## Fee model (CONTRACTS.md §4) — what a checkout session actually charges

Prices are stored as integer **cents**, currency **USD**. The full order amount is charged to the
buyer via Checkout; the creator/platform split is computed and recorded internally (not as a
Stripe Connect "application fee" on the charge itself, since the current implementation transfers
the creator's share out via a separate `stripe.transfers.create` call from `creator/payouts.ts`
rather than `payment_intent_data.application_fee_amount`):

| Tier | Platform fee | Creator keeps |
|---|---|---|
| STARTER | 20% | 80% |
| CREATOR | 15% | 85% |
| PRO | 12% | 88% |
| STUDIO | 10% | 90% |
| ENTERPRISE | 10% (negotiated) | 90%+ |

Base split before tier discount is 85/15 platform/creator; see `packages/*` ranking/economics
code for the exact `ROYALTY_ACCRUED` computation. This directory only concerns itself with how the
resulting payout amount reaches Stripe.
