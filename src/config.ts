import { z } from 'zod';

/**
 * Configuration is parsed once, at startup, from the environment. A bad value
 * stops the process immediately with a readable message rather than surfacing
 * as a strange runtime bug later on.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(8090),
  HOST: z.string().default('0.0.0.0'),
  BASE_URL: z.string().url().optional(),
  REDIRECT_PREFIX: z.string().regex(/^\/[a-z0-9-]+$/).default('/go'),
  DEFAULT_LIFETIME_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  MAX_LIFETIME_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SEED_DEMO_DATA: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
});

export type AppConfig = Readonly<{
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  baseUrl: string;
  redirectPrefix: string;
  defaultLifetimeDays: number;
  maxLifetimeDays: number;
  logLevel: string;
  seedDemoData: boolean;
}>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid configuration — ${detail}`);
  }

  const env = parsed.data;
  return Object.freeze({
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    baseUrl: (env.BASE_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ''),
    redirectPrefix: env.REDIRECT_PREFIX,
    defaultLifetimeDays: Math.min(env.DEFAULT_LIFETIME_DAYS, env.MAX_LIFETIME_DAYS),
    maxLifetimeDays: env.MAX_LIFETIME_DAYS,
    logLevel: env.LOG_LEVEL,
    seedDemoData: env.SEED_DEMO_DATA,
  });
}
