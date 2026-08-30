#!/usr/bin/env node
// Mirrors GameWorld's Postgres `User.roles`/`User.tier`/`User.orgId` onto Firebase custom claims
// for every user with a linked Firebase account (`User.firebaseUid IS NOT NULL`). See
// ../custom-claims-mapping.md for why this exists and what depends on it.
//
// Standalone script — not part of the pnpm workspace (integrations/* is excluded from
// pnpm-workspace.yaml on purpose). Install its own deps first:
//
//   cd integrations/identity/scripts
//   npm install
//   DATABASE_URL=postgresql://... FIREBASE_PROJECT_ID=... FIREBASE_SERVICE_ACCOUNT_JSON=... \
//     node sync-custom-claims.mjs
//
// Safe to run repeatedly / on a schedule: users whose Firebase claims already match are skipped
// (no unnecessary `setCustomUserClaims` calls, which are rate-limited by Firebase), and any
// per-user failure (e.g. a firebaseUid that no longer exists in Firebase) is logged and skipped
// rather than aborting the whole run.
import { Client } from 'pg';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function initFirebase() {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId = requireEnv('FIREBASE_PROJECT_ID');
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountJson) {
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  if (serviceAccountPath) {
    return initializeApp({ credential: cert(serviceAccountPath) });
  }
  // Falls back to Application Default Credentials, same as services/api's getFirebaseApp().
  return initializeApp({ projectId });
}

/** Builds the exact claims object per ../custom-claims-mapping.md's mapping table. */
function buildClaims(user) {
  const claims = {
    roles: [...user.roles].sort(),
    tier: user.tier,
  };
  if (user.orgId) claims.orgId = user.orgId;
  return claims;
}

function claimsEqual(a, b) {
  const na = a ?? {};
  const nb = b ?? {};
  const rolesA = [...(na.roles ?? [])].sort();
  const rolesB = [...(nb.roles ?? [])].sort();
  if (rolesA.length !== rolesB.length || rolesA.some((r, i) => r !== rolesB[i])) return false;
  if ((na.tier ?? null) !== (nb.tier ?? null)) return false;
  if ((na.orgId ?? null) !== (nb.orgId ?? null)) return false;
  return true;
}

async function fetchUsers(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT "id", "firebaseUid", "roles", "tier", "orgId"
       FROM "User"
       WHERE "firebaseUid" IS NOT NULL AND "deletedAt" IS NULL`,
    );
    return rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const dryRun = process.argv.includes('--dry-run');

  const app = initFirebase();
  const auth = getAuth(app);

  const users = await fetchUsers(databaseUrl);
  console.log(`Found ${users.length} user(s) with a linked Firebase account.`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    const desiredClaims = buildClaims(user);
    try {
      const firebaseUser = await auth.getUser(user.firebaseUid);
      if (claimsEqual(firebaseUser.customClaims, desiredClaims)) {
        skipped += 1;
        continue;
      }

      const claimsJson = JSON.stringify(desiredClaims);
      if (claimsJson.length > 1000) {
        console.warn(
          `Skipping user ${user.id} (${user.firebaseUid}): claims payload is ${claimsJson.length} bytes, ` +
            'over Firebase\'s 1000-byte custom claims limit. Trim the roles/mapping before retrying.',
        );
        failed += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] Would update ${user.id} (${user.firebaseUid}):`, desiredClaims);
      } else {
        await auth.setCustomUserClaims(user.firebaseUid, desiredClaims);
        console.log(`Updated ${user.id} (${user.firebaseUid}):`, desiredClaims);
      }
      updated += 1;
    } catch (err) {
      console.error(`Failed to sync claims for user ${user.id} (${user.firebaseUid}):`, err instanceof Error ? err.message : err);
      failed += 1;
    }
  }

  console.log(`Done. updated=${updated} skipped=${skipped} failed=${failed}${dryRun ? ' (dry-run, no writes made)' : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
