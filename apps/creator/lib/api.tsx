'use client';
import {
  createClient,
  type GameWorldClient,
  type PlanTier,
  type Role,
} from '@sonic-gameworld/gameworld-sdk';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'gw_creator_token';
/** Dev-login identity used when no session is stored (CONTRACTS §3 `POST /v1/auth/dev`). */
const DEV_LOGIN_EMAIL = 'nova@novaforge.dev';
const DEV_LOGIN_NAME = 'Nova Ando';

export type ConnectionStatus = 'connecting' | 'live' | 'demo';

export interface CreatorIdentity {
  userId: string;
  handle: string;
  displayName: string;
  tier: PlanTier;
  roles: Role[];
  orgId?: string | null;
}

interface ApiContextValue {
  client: GameWorldClient;
  status: ConnectionStatus;
  identity: CreatorIdentity | null;
  /** Re-run the connection attempt (dev-login + auth.me). */
  reconnect: () => void;
}

const ApiContext = createContext<ApiContextValue | null>(null);

function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // best-effort only — private browsing / disabled storage should not break the app
  }
}

/**
 * Provides a `GameWorldClient` to the whole app and establishes a session:
 * 1. Try a stored bearer token via `GET /auth/me`.
 * 2. Otherwise dev-login (`POST /auth/dev`) — works against any non-production API instance.
 * 3. If neither succeeds (no API reachable, e.g. this dashboard running standalone), fall back
 *    to `status: 'demo'` — every page then renders offline fixtures from `lib/demo.ts`.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<GameWorldClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = createClient({ baseUrl: API_BASE_URL });
  const client = clientRef.current;

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [identity, setIdentity] = useState<CreatorIdentity | null>(null);
  const [attemptId, setAttemptId] = useState(0);

  const connect = useCallback(async () => {
    setStatus('connecting');
    const stored = readStoredToken();
    if (stored) client.setToken(stored);
    try {
      const me = await client.auth.me();
      setIdentity({ userId: me.id, handle: me.handle, displayName: me.displayName, tier: me.tier, roles: me.roles, orgId: me.orgId });
      setStatus('live');
      return;
    } catch {
      // stored token missing/expired — fall through to dev-login
    }
    try {
      const session = await client.auth.dev({ email: DEV_LOGIN_EMAIL, displayName: DEV_LOGIN_NAME });
      client.setToken(session.tokens.accessToken);
      storeToken(session.tokens.accessToken);
      setIdentity({ userId: session.user.id, handle: session.user.handle, displayName: session.user.displayName, tier: session.user.tier, roles: session.user.roles, orgId: session.user.orgId });
      setStatus('live');
    } catch {
      client.setToken(undefined);
      storeToken(undefined);
      setIdentity(null);
      setStatus('demo');
    }
  }, [client]);

  useEffect(() => {
    void connect();
    // `attemptId` is bumped by `reconnect()` to force a fresh attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, attemptId]);

  const reconnect = useCallback(() => setAttemptId((n) => n + 1), []);

  const value = useMemo<ApiContextValue>(() => ({ client, status, identity, reconnect }), [client, status, identity, reconnect]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within <ApiProvider>');
  return ctx;
}

export interface ResourceState<T> {
  data: T;
  mode: 'live' | 'demo';
  loading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * Fetches a resource from the live API and falls back to a demo fixture on any failure
 * (offline, 4xx/5xx, timed out dev-login, ...). `key` should uniquely identify the query
 * (e.g. `products:${creatorId}`) so callers can distinguish resources sharing a fetcher shape.
 */
export function useResource<T>(
  key: string,
  fetcher: (client: GameWorldClient) => Promise<T>,
  demoFactory: () => T,
): ResourceState<T> {
  const { client, status } = useApi();
  const [data, setData] = useState<T>(demoFactory);
  const [mode, setMode] = useState<'live' | 'demo'>('demo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);
  // Keep the latest fetcher/demoFactory without re-triggering the effect on every render
  // (callers pass inline closures) — only `key`/`status`/`reloadToken` should re-run the fetch.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const demoRef = useRef(demoFactory);
  demoRef.current = demoFactory;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (status === 'connecting') {
      setLoading(true);
      return () => {
        cancelled = true;
      };
    }
    if (status === 'demo') {
      setData(demoRef.current());
      setMode('demo');
      setLoading(false);
      setError(undefined);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    fetcherRef
      .current(client)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setMode('live');
        setLoading(false);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(demoRef.current());
        setMode('demo');
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Request failed');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, status, key, reloadToken]);

  return { data, mode, loading, error, reload };
}
