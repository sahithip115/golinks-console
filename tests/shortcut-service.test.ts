import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RejectedInputError, StateConflictError, UnknownRecordError } from '../src/shared/errors.ts';
import type { Application } from '../src/server.ts';
import type { FixedClock } from '../src/shared/clock.ts';
import { makeApp } from './helpers.ts';

describe('ShortcutService', () => {
  let context: Application & { clock: FixedClock };

  beforeEach(async () => {
    context = await makeApp();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const register = (url: string, alias: string | null = null) =>
    context.shortcuts.register({ url, alias, owner: 'Platform', note: 'test row', lifetimeDays: null });

  it('mints a code and applies the default lifetime', () => {
    const created = context.shortcuts.register({
      url: 'https://example.com/docs',
      alias: null,
      owner: null,
      note: null,
      lifetimeDays: null,
    });

    expect(created.code).toMatch(/^[a-z0-9]{7}$/);
    expect(created.shortUrl).toBe(`http://localhost/go/${created.code}`);
    expect(created.owner).toBe('unassigned');
    expect(created.enabled).toBe(true);
    expect(created.retiresAt).toBe('2026-01-31T00:00:00.000Z');
  });

  it('keeps the alias the caller asked for, lower-cased', () => {
    expect(register('https://example.com/handbook', 'Team-Handbook').code).toBe('team-handbook');
  });

  it.each([
    ['ftp://example.com', /http and https/],
    ['not a url', /malformed/],
    ['http://127.0.0.1:9000/admin', /Internal and loopback/],
    ['http://10.1.2.3/private', /Internal and loopback/],
    ['http://192.168.0.5/router', /Internal and loopback/],
    ['https://metrics.internal/panel', /Internal and loopback/],
  ])('refuses the destination %s', (url, message) => {
    expect(() => register(url)).toThrowError(message);
  });

  it('refuses aliases that break the shape or are reserved', () => {
    expect(() => register('https://example.com', 'ab')).toThrow(RejectedInputError);
    expect(() => register('https://example.com', 'admin')).toThrowError(/reserved/);
    expect(() => register('https://example.com', 'has space')).toThrow(RejectedInputError);
  });

  it('refuses to reuse an alias', () => {
    register('https://example.com/first', 'shared-alias');
    expect(() => register('https://example.org/second', 'shared-alias')).toThrow(StateConflictError);
  });

  it('counts uses and keeps only fingerprinted context', () => {
    register('https://example.com/runbook', 'usage-demo');
    context.shortcuts.forward('usage-demo', {
      address: '203.0.113.9',
      agent: 'probe-agent',
      referrer: 'https://intranet.example.com/wiki',
    });

    const report = context.shortcuts.usage('usage-demo');
    expect(report.totalUses).toBe(1);
    expect(report.usesLastDay).toBe(1);
    expect(report.distinctVisitors).toBe(1);
    expect(report.topSources).toEqual([{ host: 'intranet.example.com', uses: 1 }]);
    expect(JSON.stringify(report)).not.toContain('203.0.113.9');
  });

  it('stops forwarding once a shortcut is switched off, and resumes when switched back on', () => {
    register('https://example.com/toggle', 'toggle-demo');
    context.shortcuts.amend('toggle-demo', { enabled: false, extendByDays: null });

    expect(() => context.shortcuts.forward('toggle-demo')).toThrow(UnknownRecordError);

    context.shortcuts.amend('toggle-demo', { enabled: true, extendByDays: null });
    expect(context.shortcuts.forward('toggle-demo')).toBe('https://example.com/toggle');
  });

  it('stops forwarding after the retirement date, and extending revives it', () => {
    register('https://example.com/expiring', 'expiry-demo');
    context.clock.advanceDays(31);

    expect(() => context.shortcuts.forward('expiry-demo')).toThrowError(/no longer available/);

    context.shortcuts.amend('expiry-demo', { enabled: null, extendByDays: 10 });
    expect(context.shortcuts.forward('expiry-demo')).toBe('https://example.com/expiring');
  });

  it('searches across code, destination, owner and note', () => {
    context.shortcuts.register({
      url: 'https://example.com/payroll',
      alias: 'payroll-demo',
      owner: 'Finance',
      note: null,
      lifetimeDays: null,
    });
    context.shortcuts.register({
      url: 'https://example.com/deploys',
      alias: 'deploy-demo',
      owner: 'Platform',
      note: 'release steps',
      lifetimeDays: null,
    });

    expect(context.shortcuts.directory('finance').shortcuts).toHaveLength(1);
    expect(context.shortcuts.directory('release steps').shortcuts).toHaveLength(1);
    expect(context.shortcuts.directory('example.com').shortcuts).toHaveLength(2);
    expect(context.shortcuts.directory('nothing here').shortcuts).toHaveLength(0);
  });

  it('reports counts that separate live, disabled and retired', () => {
    register('https://example.com/one', 'first-demo');
    register('https://example.com/two', 'second-demo');
    context.shortcuts.retire('second-demo');
    context.clock.advanceDays(31);

    expect(context.shortcuts.directory().tally).toEqual({
      total: 2,
      live: 0,
      disabled: 1,
      retired: 2,
      uses: 0,
    });
  });

  it('reports an unknown code as missing', () => {
    expect(() => context.shortcuts.read('not-registered')).toThrow(UnknownRecordError);
  });
});
