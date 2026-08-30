import type { Logger } from './shared/logger.ts';
import type { ShortcutService } from './shortcut/service/shortcut-service.ts';

/**
 * Storage is in memory, so the console would open empty on every boot. These
 * rows give it something to show; set SEED_DEMO_DATA=false to start clean.
 */
export function seedDemoData(shortcuts: ShortcutService, logger: Logger): void {
  const samples = [
    {
      url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status',
      alias: 'http-status',
      owner: 'Platform',
      note: 'HTTP status code reference',
      lifetimeDays: null,
    },
    {
      url: 'https://fastify.dev/docs/latest/',
      alias: 'fastify-docs',
      owner: 'Platform',
      note: 'Fastify reference',
      lifetimeDays: 90,
    },
    {
      url: 'https://owasp.org/www-project-top-ten/',
      alias: 'sec-top10',
      owner: 'Security',
      note: 'OWASP Top Ten',
      lifetimeDays: 180,
    },
    {
      url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
      alias: 'ts-handbook',
      owner: 'Infrastructure',
      note: 'TypeScript handbook',
      lifetimeDays: null,
    },
  ];

  for (const sample of samples) {
    shortcuts.register(sample);
  }
  shortcuts.amend('ts-handbook', { enabled: false, extendByDays: null });
  logger.info({ count: samples.length }, 'demo shortcuts seeded');
}
