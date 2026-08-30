# Webhook event catalogue

All events land on `POST /v1/payments/webhook` (`services/api/src/modules/payments/index.ts`).
The route is registered on its own Fastify child plugin with a raw-buffer body parser (Stripe
signature verification needs the exact bytes Stripe signed), verified with
`stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
(`services/api/src/modules/payments/provider.ts#verifyStripeWebhook`).

Configure the endpoint in the Stripe Dashboard (**Developers > Webhooks > Add endpoint**) at
`https://api.sonicgameworld.com/v1/payments/webhook`, or via `stripe listen` locally (see
`README.md`). Subscribe to at least the events marked **Handled** below; the rest are recommended
so the endpoint is ready as the corresponding TypeScript handlers are filled in.

| Event | Status | Effect |
|---|---|---|
| `checkout.session.completed` (`mode: payment`) | **Handled** | Resolves `orderId` from `client_reference_id`/`metadata.orderId`, calls `fulfillPaidOrder(app, orderId, { paymentRef: payment_intent, provider: 'STRIPE' })` (`orders/fulfillment.ts`) — marks the `Order` `PAID`, grants library entries, publishes `ORDER_PAID` and `PLAYER_PURCHASED_ASSET` (fans out to billing, creator, analytics, inventory per CONTRACTS §7), and accrues creator royalties (`ROYALTY_ACCRUED`). |
| `checkout.session.completed` (`mode: subscription`) | **Handled** | Resolves `userId`/`tier` from `client_reference_id`/`metadata`, calls `activateSubscriptionFromWebhook(app, userId, tier, subscriptionId)` (`subscriptions/index.ts`) — updates `User.tier` and the `Subscription` row. |
| `payment_intent.payment_failed` | Recommended | Mark the corresponding `Payment` row `FAILED` (matched by `payment_intent` id in `Payment.providerRef`) so `assessCheckoutRisk`'s `failedPaymentsInLast24h` signal (`payments/index.ts`) reflects real failures, and optionally notify the buyer. Not yet wired to a handler — add a case alongside `checkout.session.completed` in the webhook route. |
| `charge.refunded` / `refund.updated` | Recommended | Reconciliation for refunds issued *from the Stripe Dashboard* (refunds issued through `POST /orders/:id/refund` already update the `Order`/`Payment` rows synchronously via `PaymentProvider.refund()` — see below — so this event only matters for out-of-band refunds). |
| `customer.subscription.updated` | Recommended | Keep `Subscription.status`/`currentPeriodEnd` in sync with Stripe-side changes (e.g. a card update triggering a retry) that don't originate from `DELETE /subscriptions/me`. |
| `customer.subscription.deleted` | Recommended | Downgrade `User.tier` back to `STARTER` when a subscription actually ends (as opposed to `DELETE /subscriptions/me`'s cancel-at-period-end, which is the more common path). |
| `account.updated` | Recommended (Connect) | Track a connected creator account's `charges_enabled`/`payouts_enabled`/`details_submitted` flags — see `connect-onboarding.md` — so `POST /creators/me/payouts` can refuse to queue a transfer to an account that hasn't finished onboarding. |
| `transfer.failed` / `transfer.reversed` | Recommended (Connect) | Mark the corresponding `Payout` row `FAILED` when a Connect transfer fails or is reversed after the fact (insufficient platform balance, closed destination account, etc.) — `runStripeConnectPayout` (`creator/payouts.ts`) only reflects the synchronous `stripe.transfers.create()` response today. |

## Handled-event flow (as implemented)

```
Stripe                          services/api                              Event bus (§7)
──────                          ────────────                              ──────────────
checkout.session.completed  ──▶ verify signature (raw body)
  mode=payment                  fulfillPaidOrder(orderId, ...)       ──▶  ORDER_PAID
                                                                      ──▶  PLAYER_PURCHASED_ASSET
                                                                           (billing, creator, analytics, inventory)
                                                                      ──▶  ROYALTY_ACCRUED

checkout.session.completed  ──▶ verify signature (raw body)
  mode=subscription              activateSubscriptionFromWebhook(...)
                                 User.tier updated
```

## Idempotency

Stripe retries webhook deliveries on non-2xx responses and can redeliver the same event id more
than once even on success (at-least-once delivery). `fulfillPaidOrder` and
`activateSubscriptionFromWebhook` are both keyed off the target row's current state (an `Order`
already `PAID` is a no-op; re-activating an already-active subscription at the same tier is a
no-op), so redelivery is safe without a separate `processedEventIds` table. If you add a handler
for one of the "Recommended" events above, keep the same property: make the handler idempotent on
the *entity's* state rather than tracking Stripe event ids.

## Non-webhook Stripe calls

Two flows call Stripe directly rather than reacting to a webhook — both in
`services/api/src/modules/`:

* `POST /orders/:id/refund` -> `PaymentProvider.refund()` -> `stripe.refunds.create({ payment_intent, amount, reason: 'requested_by_customer' })` (`payments/provider.ts`). The `Order`/`Payment` rows are updated synchronously from the response; no webhook round-trip is required for a refund initiated through GameWorld itself.
* `POST /creators/me/payouts` -> `processPayout()` -> `stripe.transfers.create({ amount, currency, destination: stripeAccountId, transfer_group: payoutId })` (`creator/payouts.ts`). See `connect-onboarding.md` for how `stripeAccountId` gets set.
