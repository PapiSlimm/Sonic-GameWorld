# Stripe Connect onboarding (creator payouts)

`services/api`'s payout path (`creator/payouts.ts`) already does the payout *transfer* —
`stripe.transfers.create({ destination: creator.stripeAccountId, ... })` — once a creator has a
connected account on file. This document covers the piece that has to happen first: getting that
`stripeAccountId` (`Creator.stripeAccountId` in `prisma/schema.prisma`) populated with a Connect
account that's actually allowed to receive transfers.

## Account type: Express

Use **Stripe Connect Express** accounts, not Standard or Custom:

* **Standard** accounts are full Stripe Dashboard users the creator manages independently — too
  much surface area for a marketplace where GameWorld, not the creator, is the primary UI.
* **Custom** accounts put 100% of the onboarding UI and compliance burden (KYC forms, identity
  verification, tax forms) on GameWorld — not worth it pre-scale.
* **Express** gives creators a Stripe-hosted onboarding flow (KYC, bank details, tax info) and a
  lightweight Stripe Express Dashboard for their own payout history/tax docs, while GameWorld
  still owns the primary creator experience (`GameWorld Creator` app, port 3003).

## Onboarding flow

```
Creator                    services/api                         Stripe
───────                    ────────────                         ──────
"Set up payouts"     ──▶   POST /v1/creators/me/connect/onboard
  (Creator dashboard)         1. stripe.accounts.create({
                                   type: 'express',
                                   email: creator.email,
                                   capabilities: { transfers: { requested: true } },
                                   business_type: 'individual', // or 'company'
                                 })
                                -> save Creator.stripeAccountId
                             2. stripe.accountLinks.create({
                                   account: stripeAccountId,
                                   type: 'account_onboarding',
                                   refresh_url: `${WEB_URL}/settings/payouts?refresh=1`,
                                   return_url:  `${WEB_URL}/settings/payouts?done=1`,
                                 })
                             <── { url: 'https://connect.stripe.com/setup/e/...' }
Browser redirects to that url (Stripe-hosted KYC + bank account form)
                                                              ──▶  account.updated webhook
                             account.updated handler:
                               charges_enabled / payouts_enabled / details_submitted
                               -> Creator.payoutsEnabled = payouts_enabled
"Back to GameWorld"  ◀──   return_url
```

`POST /creators/me/connect/onboard` and the `account.updated` webhook handler above are not part
of the current `services/api` `creator`/`payments` modules (see CONTRACTS.md §9's `creator:` and
`payments:` route lists) — this doc specifies the contract for whoever adds that route next:

* **Request:** none (uses `request.user.userId` -> `Creator`).
* **Response:** `{ onboardingUrl: string }` — the `account_onboarding` Account Link URL, valid for
  a few minutes; the client should redirect immediately, not cache it.
* **Idempotency:** if `Creator.stripeAccountId` is already set, skip `accounts.create` and go
  straight to a fresh `accountLinks.create` for that existing account (Account Links expire and
  are meant to be re-minted, not reused) — this also correctly handles a creator who abandoned
  onboarding partway and comes back later.
* **Refresh vs return:** Stripe redirects to `refresh_url` (not `return_url`) if the Account Link
  itself expired before the creator finished — handle that route by calling the same onboarding
  endpoint again to mint a new link, rather than showing an error.

## Gating payouts on onboarding completion

`POST /creators/me/payouts` should refuse to queue a transfer until the connected account can
actually receive one. Track this with a `Creator.payoutsEnabled` boolean (add to
`prisma/schema.prisma` if not already present) kept in sync by the `account.updated` webhook
handler (see `webhook-events.md`):

```ts
if (event.type === 'account.updated') {
  const account = event.data.object as Stripe.Account;
  const creator = await app.db.creator.findFirst({ where: { stripeAccountId: account.id } });
  if (creator) {
    await app.db.creator.update({
      where: { id: creator.id },
      data: { payoutsEnabled: Boolean(account.payouts_enabled) },
    });
  }
}
```

`processPayout()` (`creator/payouts.ts`) already falls back to `runMockPayout` whenever
`stripeAccountId` is unset; extend that same guard to also check `payoutsEnabled` once the field
exists, so an in-progress onboarding never silently mock-pays a real creator in production.

## What Express accounts need to accept transfers

* `capabilities.transfers` must be `active` (requested at `accounts.create` time above; Stripe
  activates it once the creator completes the required KYC steps for their country).
* A payout-capable bank account or debit card on file — collected by the hosted onboarding flow,
  not by GameWorld.
* For US creators, Stripe additionally requires a completed W-9 (collected in the same flow) once
  cumulative payouts cross the 1099-K threshold for the tax year.

## Environment / Dashboard setup checklist

1. **Connect > Settings > Branding** — set the GameWorld logo/colors shown on the hosted
   onboarding pages.
2. **Connect > Settings > Express Dashboard** — enable, so creators can see their own payout
   history and download tax forms without GameWorld building that UI.
3. Add `account.updated` (and, for defense in depth, `capability.updated`) to the same webhook
   endpoint configured in `webhook-events.md` — Connect events arrive on the *platform* account's
   webhook endpoint by default, no separate endpoint needed.
4. `STRIPE_CONNECT_CLIENT_ID` (`ca_...`) is only needed for the OAuth-based Connect flow (a
   creator connecting an *existing* standalone Stripe account instead of Stripe creating one for
   them) — not required for the Express + Account Links flow this doc recommends, but is already
   wired into `.env.example` in case a future creator segment needs it.

## Local testing without real bank accounts

Stripe's test mode Express onboarding accepts fabricated test data end-to-end (test SSNs, test
bank account `000123456789` / routing `110000000` for US accounts) — no real creator identity or
bank account is needed to exercise the full flow, including a successful `stripe.transfers.create`
against the resulting connected account in test mode.
