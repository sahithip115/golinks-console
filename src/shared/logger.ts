import type { FastifyBaseLogger } from 'fastify';
import { pino } from 'pino';
import type { LoggerOptions } from 'pino';
import type { AppConfig } from '../config.ts';

/**
 * The app logs through Fastify's logger contract, which pino satisfies. Typing
 * it this way keeps the server, the engine, and the routes on one interface.
 */
export type Logger = FastifyBaseLogger;

/**
 * One structured logger for the process. Pretty output while developing,
 * newline-delimited JSON everywhere else so logs can be shipped and queried.
 */
export function createLogger(config: AppConfig): Logger {
  const options: LoggerOptions = {
    level: config.env === 'test' ? 'silent' : config.logLevel,
    base: { service: 'golinks-console', env: config.env },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-forwarded-for"]'],
      remove: true,
    },
  };

  if (config.env === 'development') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service,env' },
      },
    });
  }
  return pino(options);
}
