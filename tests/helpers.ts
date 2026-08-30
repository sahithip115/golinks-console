import { loadConfig } from '../src/config.ts';
import type { AppConfig } from '../src/config.ts';
import { FixedClock } from '../src/shared/clock.ts';
import { buildApp } from '../src/server.ts';
import type { Application } from '../src/server.ts';

export const FIXED_START = '2026-01-01T00:00:00.000Z';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    BASE_URL: 'http://localhost',
    SEED_DEMO_DATA: 'false',
  });
  return Object.freeze({ ...base, ...overrides });
}

/** Every test gets its own app, so in-memory state never leaks between them. */
export async function makeApp(
  overrides: Partial<AppConfig> = {},
): Promise<Application & { clock: FixedClock }> {
  const clock = new FixedClock(FIXED_START);
  const built = await buildApp({ config: testConfig(overrides), clock });
  return { ...built, clock };
}
