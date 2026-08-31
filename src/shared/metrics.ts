import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Application metrics, exposed at /metrics in the Prometheus text format.
 * Everything is registered on a private registry so tests can build a fresh
 * instance without tripping over duplicate metric names.
 */
export class Metrics {
  readonly registry = new Registry();

  readonly httpRequests: Counter<'method' | 'route' | 'status'>;
  readonly httpDuration: Histogram<'method' | 'route' | 'status'>;
  readonly shortcutsCreated: Counter<string>;
  readonly forwards: Counter<'outcome'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'golinks_' });

    this.httpRequests = new Counter({
      name: 'golinks_http_requests_total',
      help: 'HTTP requests handled, by route and status',
      labelNames: ['method', 'route', 'status'] as const,
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'golinks_http_request_duration_seconds',
      help: 'Time spent handling a request',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
    this.shortcutsCreated = new Counter({
      name: 'golinks_shortcuts_created_total',
      help: 'Shortcuts registered',
      registers: [this.registry],
    });
    this.forwards = new Counter({
      name: 'golinks_forwards_total',
      help: 'Forward attempts, by outcome',
      labelNames: ['outcome'] as const,
      registers: [this.registry],
    });
  }

  async render(): Promise<{ contentType: string; body: string }> {
    return { contentType: this.registry.contentType, body: await this.registry.metrics() };
  }
}
