import type { ApiErrorBody } from './types.js';

export type FetchLike = typeof fetch;

export interface HttpConfig {
  baseUrl: string;
  token?: string;
  apiKey?: string;
  fetch?: FetchLike;
}

export interface RequestOptions {
  /** Accepts any plain query-params object (e.g. one of the `*ListQuery`/`*Query` DTOs). */
  query?: object;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip attaching Authorization/x-api-key headers (used by auth.dev/auth.firebase). */
  unauthenticated?: boolean;
  signal?: AbortSignal;
}

/** Error thrown for any non-2xx API response, carrying the parsed `{ code, message, details? }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function resolveFetch(custom?: FetchLike): FetchLike {
  const impl = custom ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!impl) {
    throw new Error(
      '@sonic-gameworld/gameworld-sdk: no global fetch is available in this runtime — pass { fetch } to createClient().',
    );
  }
  return impl;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(base + (path.startsWith('/') ? path : `/${path}`));
  if (query) {
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Thin typed HTTP client bound to the GameWorld API's `/v1` conventions (§9 of CONTRACTS.md). */
export class HttpClient {
  private readonly fetchImpl: FetchLike;
  private config: HttpConfig;

  constructor(config: HttpConfig) {
    this.config = config;
    this.fetchImpl = resolveFetch(config.fetch);
  }

  /** Update the bearer token used for subsequent requests (e.g. after auth.refresh()). */
  setToken(token: string | undefined): void {
    this.config = { ...this.config, token };
  }

  setApiKey(apiKey: string | undefined): void {
    this.config = { ...this.config, apiKey };
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  get token(): string | undefined {
    return this.config.token;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (!opts.unauthenticated) {
      if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;
      if (this.config.apiKey) headers['x-api-key'] = this.config.apiKey;
    }

    const res = await this.fetchImpl(buildUrl(this.config.baseUrl, path, opts.query), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

    const text = await res.text();
    const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

    if (!res.ok) {
      const body = json as Partial<ApiErrorBody> | undefined;
      const err = body?.error;
      throw new ApiError(res.status, err?.code ?? 'UNKNOWN_ERROR', err?.message ?? res.statusText, err?.details);
    }
    return json as T;
  }

  get<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, opts);
  }
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  delete<T>(path: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, opts);
  }
}
