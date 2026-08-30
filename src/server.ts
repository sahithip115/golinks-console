import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { loadConfig } from './config.ts';
import type { AppConfig } from './config.ts';
import { systemClock } from './shared/clock.ts';
import type { Clock } from './shared/clock.ts';
import { toFailure } from './shared/http.ts';
import { createLogger } from './shared/logger.ts';
import type { Logger } from './shared/logger.ts';
import { Metrics } from './shared/metrics.ts';
import { registerShortcutRoutes } from './shortcut/api/routes.ts';
import { InMemoryShortcutRepository } from './shortcut/repository/shortcut-repository.ts';
import { ShortcutService } from './shortcut/service/shortcut-service.ts';
import { registerDeliveryRoutes } from './delivery/api/routes.ts';
import { InMemoryRunRepository } from './delivery/repository/run-repository.ts';
import { DeliveryEngine } from './delivery/service/delivery-engine.ts';
import { seedDemoData } from './seed.ts';

export interface BuildOptions {
  config?: AppConfig;
  clock?: Clock;
  logger?: Logger;
}

export interface Application {
  app: FastifyInstance;
  config: AppConfig;
  shortcuts: ShortcutService;
  engine: DeliveryEngine;
  metrics: Metrics;
}

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Builds the application. Nothing here binds a port, so tests can drive the
 * whole surface through `app.inject` with no sockets involved.
 */
export async function buildApp(options: BuildOptions = {}): Promise<Application> {
  const config = options.config ?? loadConfig();
  const clock = options.clock ?? systemClock;
  const logger = options.logger ?? createLogger(config);
  const metrics = new Metrics();

  // Annotated with the base instance type: passing a concrete pino logger would
  // otherwise narrow the generic and make the route modules awkward to type.
  const app: FastifyInstance = Fastify({
    loggerInstance: logger,
    // A caller-supplied id is honoured so a request can be followed across services.
    genReqId: (request) => (request.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  const shortcuts = new ShortcutService(new InMemoryShortcutRepository(), clock, config, metrics);
  const engine = new DeliveryEngine(new InMemoryRunRepository(), clock, logger, metrics);

  // Baseline browser protections plus the request id on every response.
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    done();
  });

  // Fastify writes the request/response lines itself (each tagged with reqId);
  // this hook adds the route label and feeds the same timing to Prometheus.
  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions.url ?? 'unmatched';
    const labels = { method: request.method, route, status: String(reply.statusCode) };
    metrics.httpRequests.inc(labels);
    metrics.httpDuration.observe(labels, reply.elapsedTime / 1000);
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toFailure(error, request);
    const level = status >= 500 ? 'error' : 'warn';
    request.log[level]({ requestId: request.id, code: body.code, status, err: error }, body.message);
    return reply.code(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const { status, body } = toFailure({ statusCode: 404 }, request);
    return reply.code(status).send(body);
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'golinks-console',
    uptimeSeconds: Math.round(process.uptime()),
    checks: { shortcutStore: 'ok', deliveryStore: 'ok' },
    time: clock.now().toISOString(),
  }));

  app.get('/metrics', async (_request, reply) => {
    const { contentType, body } = await metrics.render();
    return reply.header('content-type', contentType).send(body);
  });

  await registerShortcutRoutes(app, { shortcuts, redirectPrefix: config.redirectPrefix });
  await registerDeliveryRoutes(app, { engine, now: () => clock.now() });

  await app.register(fastifyStatic, {
    root: join(HERE, '..', 'public'),
    index: ['index.html'],
    cacheControl: config.env === 'production',
    maxAge: config.env === 'production' ? '5m' : 0,
  });

  if (config.seedDemoData) {
    seedDemoData(shortcuts, logger);
  }

  return { app, config, shortcuts, engine, metrics };
}
