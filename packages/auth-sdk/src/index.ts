export const PACKAGE_NAME = '@sonic-gameworld/auth-sdk';

import { createClient, type GameWorldClient, type GameWorldClientOptions } from '@sonic-gameworld/gameworld-sdk';

export type {
  ApiKey, ApiKeyCreated, AuthContext, AuthSession, AuthTokens, CreateApiKeyInput, DevLoginInput,
  FirebaseLoginInput, PlanTier, Role, User, UserPatch,
} from '@sonic-gameworld/gameworld-sdk';
export { ApiError } from '@sonic-gameworld/gameworld-sdk';

/** The `auth` namespace of {@link GameWorldClient} — dev/Firebase login, refresh, API keys. */
export type AuthClient = GameWorldClient['auth'];

/**
 * Create a scoped client exposing only the identity/auth routes (§9 `auth:` and `users:`).
 * Thin wrapper over `@sonic-gameworld/gameworld-sdk`'s `createClient(options).auth`.
 */
export function createAuthClient(options: GameWorldClientOptions): AuthClient {
  return createClient(options).auth;
}

/** Escape hatch to the full client when other SDKs (users/orgs) are also needed. */
export function createFullClient(options: GameWorldClientOptions): GameWorldClient {
  return createClient(options);
}
