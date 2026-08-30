import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(name: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  const isProd = process.env.NODE_ENV === 'production';
  return pino({
    name,
    level,
    transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  });
}
