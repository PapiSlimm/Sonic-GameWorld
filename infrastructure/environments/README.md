# Environment templates

Three `.env` templates — `dev.env.example`, `staging.env.example`, `prod.env.example` — covering
every environment variable actually read across `services/api` (`src/config.ts`), all 6
`workers/*` (`src/env.ts`), and the frontend apps' `NEXT_PUBLIC_*` build-time vars. These are more
complete than the root `.env.example` (which predates several of the corrections below) — prefer
these when setting up a real deployment; the root file remains the quick-start default for
`docker compose up -d`.

| File | Use for |
|---|---|
| `dev.env.example` | `docker compose up -d` + `pnpm dev` locally. Every value is a working default — copy to the repo root as `.env` and go. |
| `staging.env.example` | A staging deploy (Render or the GCP Terraform module) — real managed Postgres/Redis/storage, test-mode Stripe keys, `NODE_ENV=production` (see the note inside that file on why). |
| `prod.env.example` | A production deploy — same shape as staging, live keys, tighter worker concurrency defaults, restrictive `CORS_ORIGIN`. |

## Cross-package env var naming issues (found while building this)

These are real inconsistencies in the application code across packages, not mistakes in these
templates — both naming conventions are set to the same value in each template so every affected
service resolves correctly regardless of which one it reads. Full detail in each linked doc; the
short version:

| Concept | `services/api` reads | `workers/*` read | Root `.env.example` matches |
|---|---|---|---|
| S3 access key | `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY` | workers' naming |
| S3 secret key | `S3_SECRET_ACCESS_KEY` | `S3_SECRET_KEY` | workers' naming |
| Asset public URL base | `S3_PUBLIC_URL_BASE` | `CDN_BASE_URL` | workers' naming |
| Firebase service account | `FIREBASE_SERVICE_ACCOUNT_JSON` / `FIREBASE_SERVICE_ACCOUNT_PATH` | *(not used)* | neither — root file has `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`, which `services/api` never reads |
| API's own port | `API_PORT` (not the platform-standard `PORT`) | — | root file has both `API_PORT` and an unused `API_URL` |
| Redirect base for Stripe Checkout | `API_BASE_URL` (despite the name, this must be a **web app** URL — see `integrations/stripe/README.md`) | — | root file's `WEB_URL`/`API_URL` are both unread |

See `integrations/storage/README.md`, `integrations/identity/README.md`, and the root README's
cross-package notes for the full writeup of each.

## What's NOT here

Secrets (`JWT_SECRET`, `STRIPE_SECRET_KEY`, Firebase/Anthropic/Gemini/MapTiler keys, S3
credentials) are placeholders (`SET-IN-SECRET-MANAGER-OR-RENDER-ENV-GROUP`) in the staging/prod
templates on purpose — they belong in `render.yaml`'s `gameworld-secrets` env var group (Render)
or `infrastructure/terraform/secrets.tf` (GCP Secret Manager), never in a file that could be
committed. `dev.env.example` is the only template with real, working (but non-production) values,
since local dev secrets carry no real risk.
