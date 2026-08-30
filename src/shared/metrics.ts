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
  readonly runsLaunched: Counter<'scenario'>;
  readonly runsClosed: Counter<'state'>;
  readonly nodeRetries: Counter<'phase'>;
  readonly nodeDegrades: Counter<'phase'>;
  readonly runDuration: Histogram<'state'>;

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
    this.runsLaunched = new Counter({
      name: 'golinks_delivery_runs_launched_total',
      help: 'Delivery runs launched, by scenario',
      labelNames: ['scenario'] as const,
      registers: [this.registry],
    });
    this.runsClosed = new Counter({
      name: 'golinks_delivery_runs_closed_total',
      help: 'Delivery runs that reached a terminal state',
      labelNames: ['state'] as const,
      registers: [this.registry],
    });
    this.nodeRetries = new Counter({
      name: 'golinks_delivery_node_retries_total',
      help: 'Phase attempts retried within their budget',
      labelNames: ['phase'] as const,
      registers: [this.registry],
    });
    this.nodeDegrades = new Counter({
      name: 'golinks_delivery_node_degrades_total',
      help: 'Phases that fell back to a degraded output',
      labelNames: ['phase'] as const,
      registers: [this.registry],
    });
    this.runDuration = new Histogram({
      name: 'golinks_delivery_run_duration_seconds',
      help: 'Wall-clock time from launch to terminal state',
      labelNames: ['state'] as const,
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
      registers: [this.registry],
    });
  }

  async render(): Promise<{ contentType: string; body: string }> {
    return { contentType: this.registry.contentType, body: await this.registry.metrics() };
  }
}
