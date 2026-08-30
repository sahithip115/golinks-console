import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateConflictError, UnknownRecordError } from '../src/shared/errors.ts';
import type { Application } from '../src/server.ts';
import type { DeliveryRun, Phase } from '../src/delivery/domain/types.ts';
import { makeApp } from './helpers.ts';

const ASK = 'Deliver shortcut expiry and usage reporting without weakening any control.';

describe('DeliveryEngine', () => {
  let context: Application;

  beforeEach(async () => {
    context = await makeApp();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const launch = (breakPhase: Phase | null = null, ask = ASK) =>
    context.engine.launch({ scenario: 'NEW_BUILD', ask, breakPhase });

  const node = (run: DeliveryRun, phase: Phase) => {
    const found = run.nodes.find((candidate) => candidate.phase === phase);
    if (!found) throw new Error(`No node for ${phase}`);
    return found;
  };

  it('runs the graph and stops at the sign-off gate', () => {
    const run = launch();

    expect(run.state).toBe('HELD_FOR_SIGN_OFF');
    expect(node(run, 'GO_NO_GO').state).toBe('DONE');
    expect(node(run, 'ROLLOUT').state).toBe('QUEUED');
    expect(run.artifacts.length).toBeGreaterThan(0);
    expect(run.audit.map((entry) => entry.kind)).toContain('SIGN_OFF_REQUESTED');
  });

  it('places design and threat review in the same wave behind intake', () => {
    const run = launch();

    expect(node(run, 'DESIGN').waitsFor).toEqual(['INTAKE']);
    expect(node(run, 'THREAT_REVIEW').waitsFor).toEqual(['INTAKE']);
    expect(node(run, 'BUILD').waitsFor).toEqual(['DESIGN', 'THREAT_REVIEW']);
  });

  it('completes the run once a named reviewer approves', () => {
    const started = launch();
    const finished = context.engine.recordSignOff(started.id, {
      reviewer: 'Sahithi Periketi',
      approved: true,
      comment: 'Checks and evidence reviewed',
    });

    expect(finished.state).toBe('DELIVERED');
    expect(finished.nodes.every((candidate) => candidate.state === 'DONE')).toBe(true);
    expect(finished.audit.some((entry) => entry.note.includes('reviewer=Sahithi Periketi'))).toBe(true);
  });

  it('rolls delivery work back on rejection but keeps the analysis', () => {
    const started = launch();
    const rejected = context.engine.recordSignOff(started.id, {
      reviewer: 'Reviewer',
      approved: false,
      comment: 'Not ready',
    });

    expect(rejected.state).toBe('COMPENSATED');
    expect(rejected.compensations).toBe(1);
    expect(node(rejected, 'INTAKE').state).toBe('DONE');
    expect(node(rejected, 'DESIGN').state).toBe('DONE');
    expect(node(rejected, 'BUILD').state).toBe('COMPENSATED');
    expect(node(rejected, 'GO_NO_GO').state).toBe('COMPENSATED');
  });

  it('retries a first-attempt failure within the budget', () => {
    const run = launch('INTAKE');

    expect(run.retries).toBe(1);
    expect(node(run, 'INTAKE').state).toBe('DONE');
    expect(node(run, 'INTAKE').tries).toBe(2);
    expect(run.state).toBe('HELD_FOR_SIGN_OFF');
  });

  it('degrades a phase that keeps failing instead of sinking the run', () => {
    const run = launch('BUILD');

    expect(run.retries).toBe(1);
    expect(run.degrades).toBe(1);
    expect(node(run, 'BUILD').state).toBe('DONE');
    expect(run.audit.map((entry) => entry.kind)).toContain('NODE_DEGRADED');
    expect(run.artifacts.some((artifact) => artifact.path.startsWith('degraded/'))).toBe(true);
  });

  it('halts an ask that weakens a control before any phase runs', () => {
    const run = launch(null, 'Speed up forwarding and disable authentication on the admin console.');

    expect(run.state).toBe('HALTED_BY_POLICY');
    expect(run.nodes.every((candidate) => candidate.state === 'QUEUED')).toBe(true);
    expect(run.audit.map((entry) => entry.kind)).toContain('POLICY_HALT');
    expect(run.artifacts).toHaveLength(0);
  });

  it('raises the revision and rebuilds the plan when the ask changes', () => {
    const started = launch();
    const revised = context.engine.revise(started.id, {
      ask: 'Add per-team ownership and expiry reminders to every shortcut.',
    });

    expect(revised.revision).toBe(2);
    expect(revised.state).toBe('HELD_FOR_SIGN_OFF');
    expect(revised.clarifiedAsk).toContain('per-team ownership');
    expect(revised.audit.map((entry) => entry.kind)).toContain('PLAN_INVALIDATED');
  });

  it('refuses a sign-off when the run is not at the gate', () => {
    const started = launch();
    context.engine.recordSignOff(started.id, { reviewer: 'Reviewer', approved: true, comment: null });

    expect(() =>
      context.engine.recordSignOff(started.id, { reviewer: 'Reviewer', approved: true, comment: null }),
    ).toThrow(StateConflictError);
  });

  it('refuses to revise a halted run and reports unknown runs', () => {
    const halted = launch(null, 'Please disable audit logging on the shortcut service.');

    expect(() => context.engine.revise(halted.id, { ask: 'A perfectly reasonable revised ask.' }))
      .toThrow(StateConflictError);
    expect(() => context.engine.get('11111111-2222-3333-4444-555555555555')).toThrow(UnknownRecordError);
  });

  it('stores every artifact with a digest that can be read back', () => {
    const run = launch();
    const first = run.artifacts[0];
    if (!first) throw new Error('expected at least one artifact');

    const fetched = context.engine.artifact(run.id, first.id);
    expect(fetched.body.startsWith('#')).toBe(true);
    expect(fetched.digest).toMatch(/^[0-9a-f]{40}$/);
  });
});
