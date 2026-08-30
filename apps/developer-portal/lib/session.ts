/**
 * Lightweight browser-side session storage for the GameWorld JWT used by the developer portal.
 * Developers sign in with a dev-login email (POST /v1/auth/dev); the token is kept in
 * localStorage only and is what authorizes API key / webhook management calls against the real
 * API when it is reachable.
 */
export interface StoredSession {
  token: string;
  email: string;
  obtainedAt: string;
}

const STORAGE_KEY = 'gw_devportal_session_v1';

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

export function loadSession(): StoredSession | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed?.token !== 'string' || parsed.token.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable (private browsing, quota) — session simply won't persist */
  }
}

export function clearSession(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
