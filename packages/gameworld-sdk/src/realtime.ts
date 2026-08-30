import type { RealtimeClientOp, RealtimeMessage } from './types.js';

/** Minimal shape of the WebSocket API this module needs — matches both DOM `WebSocket` and `ws`. */
export interface MinimalWebSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export interface RealtimeOptions {
  baseUrl: string;
  token?: string;
  /** Reconnect automatically on close (default true). */
  reconnect?: boolean;
  /** Base delay in ms between reconnect attempts (exponential backoff, default 1000). */
  reconnectDelayMs?: number;
  /** Called whenever the socket connects (or reconnects). */
  onOpen?: () => void;
  /** Called whenever the socket disconnects. */
  onClose?: (ev: unknown) => void;
  /** Called on transport errors. */
  onError?: (err: unknown) => void;
}

export interface RealtimeHandle {
  /** Subscribe to an additional topic on the live connection. */
  subscribe(topic: string): void;
  /** Unsubscribe from a topic. */
  unsubscribe(topic: string): void;
  /** Publish a message on a topic (if the server permits it for this client). */
  publish(topic: string, type: string, payload: unknown): void;
  /** Close the connection and stop any reconnect attempts. */
  close(): void;
  /** Currently subscribed topics. */
  readonly topics: readonly string[];
}

function wsUrlFor(baseUrl: string, token?: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.endsWith('/') ? `${url.pathname}ws` : `${url.pathname}/ws`;
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

async function openSocket(url: string): Promise<MinimalWebSocket> {
  const g = globalThis as { WebSocket?: new (url: string) => MinimalWebSocket };
  if (typeof g.WebSocket === 'function') {
    return new g.WebSocket(url);
  }
  // Node.js: lazily import the optional `ws` peer dependency so browser bundlers never see it.
  const mod: unknown = await import('ws');
  const WS = (mod as { default?: new (url: string) => MinimalWebSocket }).default
    ?? (mod as unknown as new (url: string) => MinimalWebSocket);
  return new WS(url);
}

/**
 * Open a realtime connection to `GET /ws?token=` and subscribe to `topics`.
 * Uses the browser's global `WebSocket` when available, otherwise lazily imports the
 * optional `ws` package (Node.js). Reconnects with exponential backoff by default.
 */
export function connectRealtime(
  topics: string[],
  onMessage: (msg: RealtimeMessage) => void,
  options: RealtimeOptions,
): RealtimeHandle {
  const subscribed = new Set(topics);
  let closedByUser = false;
  let socket: MinimalWebSocket | undefined;
  let attempt = 0;

  const send = (op: RealtimeClientOp) => {
    if (socket && socket.readyState === 1 /* OPEN */) {
      socket.send(JSON.stringify(op));
    }
  };

  const connect = () => {
    openSocket(wsUrlFor(options.baseUrl, options.token))
      .then((sock) => {
        socket = sock;
        sock.onopen = () => {
          attempt = 0;
          for (const topic of subscribed) send({ op: 'SUBSCRIBE', topic });
          options.onOpen?.();
        };
        sock.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(String(ev.data)) as RealtimeMessage;
            onMessage(parsed);
          } catch (err) {
            options.onError?.(err);
          }
        };
        sock.onerror = (err) => options.onError?.(err);
        sock.onclose = (ev) => {
          options.onClose?.(ev);
          if (!closedByUser && (options.reconnect ?? true)) {
            const delay = (options.reconnectDelayMs ?? 1000) * Math.pow(2, Math.min(attempt++, 5));
            setTimeout(connect, delay);
          }
        };
      })
      .catch((err) => options.onError?.(err));
  };

  connect();

  return {
    get topics() {
      return Array.from(subscribed);
    },
    subscribe(topic: string) {
      subscribed.add(topic);
      send({ op: 'SUBSCRIBE', topic });
    },
    unsubscribe(topic: string) {
      subscribed.delete(topic);
      send({ op: 'UNSUBSCRIBE', topic });
    },
    publish(topic: string, type: string, payload: unknown) {
      send({ op: 'PUBLISH', topic, type, payload });
    },
    close() {
      closedByUser = true;
      socket?.close();
    },
  };
}
