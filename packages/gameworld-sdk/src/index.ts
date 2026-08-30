export const PACKAGE_NAME = '@sonic-gameworld/gameworld-sdk';

export { createClient, GameWorldClient, type GameWorldClientOptions } from './client.js';
export { HttpClient, ApiError, type HttpConfig, type RequestOptions, type FetchLike } from './http.js';
export {
  connectRealtime,
  type RealtimeHandle,
  type RealtimeOptions,
  type MinimalWebSocket,
} from './realtime.js';

export * from './types.js';
