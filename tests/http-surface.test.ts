import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Application } from '../src/server.ts';
import { makeApp } from './helpers.ts';

describe('HTTP surface', () => {
  let context: Application;

  beforeEach(async () => {
    context = await makeApp();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const register = (body: Record<string, unknown>) =>
    context.app.inject({ method: 'POST', url: '/api/v1/shortcuts', payload: body });

  it('answers health with a status and its checks', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', checks: { shortcutStore: 'ok' } });
  });

  it('publishes Prometheus metrics that count the traffic it served', async () => {
    await register({ url: 'https://example.com/metrics-demo', alias: 'metrics-demo' });
    await context.app.inject({ method: 'GET', url: '/go/metrics-demo' });

    const response = await context.app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('golinks_shortcuts_created_total 1');
    expect(response.body).toContain('golinks_forwards_total{outcome="forwarded"} 1');
    expect(response.body).toContain('golinks_http_requests_total');
  });

  it('registers, lists, forwards, and reports usage', async () => {
    const created = await register({
      url: 'https://example.com/handbook',
      alias: 'http-handbook',
      owner: 'Ops',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ code: 'http-handbook', owner: 'Ops' });

    const directory = await context.app.inject({ method: 'GET', url: '/api/v1/shortcuts?q=handbook' });
    expect(directory.json().shortcuts).toHaveLength(1);
    expect(directory.json().tally.total).toBe(1);

    const forwarded = await context.app.inject({ method: 'GET', url: '/go/http-handbook' });
    expect(forwarded.statusCode).toBe(302);
    expect(forwarded.headers.location).toBe('https://example.com/handbook');
    expect(forwarded.headers['cache-control']).toBe('no-store');
    expect(forwarded.headers['x-content-type-options']).toBe('nosniff');

    const usage = await context.app.inject({ method: 'GET', url: '/api/v1/shortcuts/http-handbook/usage' });
    expect(usage.json()).toMatchObject({ totalUses: 1, usesLastDay: 1 });
  });

  it('describes a rejected field and echoes the request id', async () => {
    const response = await register({ url: 'javascript:alert(1)' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'rejected_input' });
    expect(response.json().fields.url).toBeTruthy();
    expect(response.json().requestId).toBe(response.headers['x-request-id']);
  });

  it('honours a caller-supplied request id so a call can be traced end to end', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/api/v1/shortcuts/missing-code',
      headers: { 'x-request-id': 'trace-me-123' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['x-request-id']).toBe('trace-me-123');
    expect(response.json().requestId).toBe('trace-me-123');
  });

  it('conflicts on a duplicate alias and 404s an unknown code', async () => {
    await register({ url: 'https://example.com/one', alias: 'duplicate-alias' });

    const conflict = await register({ url: 'https://example.org/two', alias: 'duplicate-alias' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe('state_conflict');

    const missing = await context.app.inject({ method: 'GET', url: '/go/never-registered' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('unknown_record');
  });

  it('switches a shortcut off and back on', async () => {
    await register({ url: 'https://example.com/retire', alias: 'retire-me' });

    const disabled = await context.app.inject({ method: 'DELETE', url: '/api/v1/shortcuts/retire-me' });
    expect(disabled.json().enabled).toBe(false);
    expect((await context.app.inject({ method: 'GET', url: '/go/retire-me' })).statusCode).toBe(404);

    const enabled = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/shortcuts/retire-me',
      payload: { enabled: true },
    });
    expect(enabled.json().enabled).toBe(true);
    expect((await context.app.inject({ method: 'GET', url: '/go/retire-me' })).statusCode).toBe(302);
  });

  it('rejects an empty patch and a malformed body without leaking internals', async () => {
    await register({ url: 'https://example.com/patch', alias: 'patch-demo' });

    const empty = await context.app.inject({
      method: 'PATCH',
      url: '/api/v1/shortcuts/patch-demo',
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().code).toBe('rejected_input');

    const malformed = await context.app.inject({
      method: 'POST',
      url: '/api/v1/shortcuts',
      payload: '{oops',
      headers: { 'content-type': 'application/json' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().code).toBe('unreadable_body');
    expect(malformed.body).not.toContain('at Object');
  });

  it('serves the console page and its compiled script', async () => {
    const page = await context.app.inject({ method: 'GET', url: '/' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('GoLinks Console');

    const script = await context.app.inject({ method: 'GET', url: '/assets/console.js' });
    expect(script.statusCode).toBe(200);
  });
});
