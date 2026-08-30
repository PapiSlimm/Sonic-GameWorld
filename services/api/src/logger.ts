// pino logger factory shared by the Fastify app, the webhook dispatcher, and standalone scripts.
import pino from 'pino';
import { getConfig } from './config.js';

export type Logger = pino.Logger;

let rootLogger: Logger | undefined;

/** Build (or reuse) the process-wide root logger. Pretty-printed outside production. */
export function createLogger(name = '@sonic-gameworld/api'): Logger {
  const config = getConfig();
  if (rootLogger) return rootLogger.child({ name });

  const transport =
    config.isProd || config.isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } };

  rootLogger = pino({ level: config.logLevel, base: { service: name }, transport });
  return rootLogger;
}

export function getLogger(): Logger {
  return rootLogger ?? createLogger();
}
