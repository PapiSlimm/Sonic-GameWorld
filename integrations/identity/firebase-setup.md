# Firebase project setup

## 1. Create the project

[Firebase Console](https://console.firebase.google.com/) -> **Add project**. If you're also using
`infrastructure/terraform`'s GCP project for Cloud SQL/Cloud Run/etc., add Firebase to that *same*
GCP project (Firebase Console -> **Add Firebase to an existing GCP project**) rather than creating
a second one — keeps IAM, billing, and `GCP_PROJECT_ID`/`FIREBASE_PROJECT_ID` as a single value.

## 2. Enable sign-in providers

**Authentication > Sign-in method**, enable at minimum:

* **Email/Password** — needed for `POST /v1/auth/dev`-equivalent flows in production (real
  email/password sign-up, as opposed to dev-login which is disabled when `NODE_ENV=production`).
* **Google** — the most common social login for creator tooling.
* Optionally **Apple**, **Anonymous** (browse-before-signup on GameWorld Play, port 3002), and
  phone auth if the player app needs it.

## 3. Register the client apps

**Project settings > General > Your apps**, add:

* A **Web app** per Next.js frontend that needs client-side sign-in (`player`, `studio`,
  `creator` at minimum) — or one shared Web app config reused across all of them, since they all
  exchange the resulting ID token against the same `POST /v1/auth/firebase` endpoint. Copy the
  resulting `firebaseConfig` object into each app's `NEXT_PUBLIC_FIREBASE_*` env vars.
* Optionally an **Android**/**iOS** app if a native mobile client is ever added — irrelevant to
  the Unity/Unreal SDKs, which authenticate through the *engine's* Firebase SDK plugin (Firebase
  Unity SDK / Firebase Unreal Plugin) using the same web `firebaseConfig` project id, then hand
  the resulting ID token to `GameWorldAuth.LoginWithFirebaseIdToken` /
  `UGameWorldSubsystem::LoginWithFirebaseIdToken` (see `integrations/unity`/`integrations/unreal`).

## 4. Generate a service account for the backend (`services/api`)

**Project settings > Service accounts > Generate new private key.** This downloads a JSON key
file — `firebase-admin`'s `cert()` credential (used by `verifyFirebaseIdToken` in
`services/api/src/plugins/auth.ts`) needs its contents, not the file path, in most deployment
targets:

```bash
# Render / any platform without a persistent mounted filesystem:
FIREBASE_SERVICE_ACCOUNT_JSON=$(cat service-account.json | jq -c .)
# store the resulting single-line JSON string as a secret env var

# Local dev / a platform with a real filesystem:
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/service-account.json
```

If **neither** is set, `getFirebaseApp()` falls back to
`initializeApp({ projectId: FIREBASE_PROJECT_ID })`, which relies on Application Default
Credentials (`GOOGLE_APPLICATION_CREDENTIALS`, a GCE/Cloud Run metadata server, or
`gcloud auth application-default login` locally) — this works cleanly when `services/api` runs on
Cloud Run in the *same* GCP project as the Firebase project (the Cloud Run service's attached
service account needs the **Firebase Authentication Admin** IAM role), and is what
`infrastructure/terraform`'s Cloud Run module assumes in `README.md`. On Render, always set
`FIREBASE_SERVICE_ACCOUNT_JSON` explicitly — there's no ADC available.

**Never commit the downloaded JSON key file.** Treat it exactly like `JWT_SECRET`/
`STRIPE_SECRET_KEY` — a Secret Manager entry (GCP) or a marked-secret env var group entry
(Render), never a repo file.

## 5. Restrict token verification to this project

`verifyFirebaseIdToken` calls `getAuth(app).verifyIdToken(idToken)`, which — as long as the admin
SDK was initialized with this project's credentials/`projectId` — already rejects ID tokens issued
for any *other* Firebase project. No additional audience check is needed in application code.

## 6. Local dev without a real Firebase project

`POST /v1/auth/dev` (email-only, no Firebase round-trip at all) is available whenever
`NODE_ENV !== 'production'` and is the recommended path for local development — you do not need a
real Firebase project, sign-in providers, or a service account key just to run the stack locally.
Only wire up real Firebase credentials when you need to exercise `POST /v1/auth/firebase` itself
(e.g. testing a frontend's actual sign-in UI, or the Unity/Unreal SDK's
`LoginWithFirebaseIdToken` path).
