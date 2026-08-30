import type { Clock } from '../../shared/clock.ts';
import { StateConflictError, UnknownRecordError, describe } from '../../shared/errors.ts';
import { digest, newId } from '../../shared/ids.ts';
import type { Logger } from '../../shared/logger.ts';
import type { Metrics } from '../../shared/metrics.ts';
import { degradedOutput, workerFor } from '../agent/index.ts';
import type { PhaseBrief, PhaseOutput } from '../agent/index.ts';
import type { LaunchInput, RevisionInput, SignOffInput } from '../api/schemas.ts';
import { buildPlan, readyNodes } from '../domain/plan.ts';
import { TERMINAL_STATES } from '../domain/types.ts';
import type {
  AuditKind,
  DeliveryRun,
  Phase,
  PhaseArtifact,
  PlanNode,
  RunState,
} from '../domain/types.ts';
import type { RunRepository } from '../repository/run-repository.ts';
import { screenAsk } from './change-policy.ts';

/** Guards against a malformed plan spinning the loop forever. */
const MAX_PASSES = 40;

/** Analysis stays true when later work is undone, so these are never compensated. */
const KEEP_ON_COMPENSATION: ReadonlySet<Phase> = new Set<Phase>(['INTAKE', 'DESIGN']);

/**
 * Drives a run across its plan graph. Each pass collects every node whose
 * prerequisites are satisfied, runs that wave, folds the results back in, and
 * looks again — so the graph decides what happens next, not a fixed sequence.
 */
export class DeliveryEngine {
  readonly #repository: RunRepository;
  readonly #clock: Clock;
  readonly #logger: Logger;
  readonly #metrics: Metrics;

  constructor(repository: RunRepository, clock: Clock, logger: Logger, metrics: Metrics) {
    this.#repository = repository;
    this.#clock = clock;
    this.#logger = logger.child({ component: 'delivery-engine' });
    this.#metrics = metrics;
  }

  launch(input: LaunchInput): DeliveryRun {
    const now = this.#clock.now();
    const run: DeliveryRun = {
      id: newId(),
      scenario: input.scenario,
      ask: input.ask,
      clarifiedAsk: null,
      state: 'IN_FLIGHT',
      revision: 1,
      retries: 0,
      degrades: 0,
      compensations: 0,
      breakPhase: input.breakPhase ?? null,
      draftedAt: now,
      launchedAt: null,
      closedAt: null,
      nodes: buildPlan(),
      audit: [],
      artifacts: [],
    };
    this.#repository.save(run);
    this.#log(run, null, 'RUN_DRAFTED', 'Plan revision 1 stored as a dependency graph');

    const verdict = screenAsk(run.ask);
    if (!verdict.permitted) {
      run.state = 'HALTED_BY_POLICY';
      run.closedAt = now;
      this.#log(run, null, 'POLICY_HALT', verdict.reasoning);
      this.#metrics.runsClosed.inc({ state: run.state });
      this.#logger.warn({ runId: run.id, scenario: run.scenario }, 'run halted by change policy');
      return run;
    }

    run.launchedAt = now;
    this.#log(run, null, 'RUN_LAUNCHED', verdict.reasoning);
    this.#metrics.runsLaunched.inc({ scenario: run.scenario });
    this.#advance(run);
    return run;
  }

  get(runId: string): DeliveryRun {
    const run = this.#repository.find(runId);
    if (!run) throw new UnknownRecordError(`No delivery run exists with id ${runId}`);
    return run;
  }

  list(): DeliveryRun[] {
    return this.#repository.listNewestFirst();
  }

  recordSignOff(runId: string, input: SignOffInput): DeliveryRun {
    const run = this.get(runId);
    if (run.state !== 'HELD_FOR_SIGN_OFF') {
      throw new StateConflictError('This run is not waiting for a sign-off');
    }

    const gate = run.nodes.find((node) => node.phase === 'SIGN_OFF');
    if (!gate) throw new StateConflictError('The plan has no sign-off gate');

    const evidence =
      `reviewer=${input.reviewer}; approved=${input.approved}` +
      (input.comment ? `; comment=${input.comment}` : '');
    this.#log(run, gate.phase, 'SIGN_OFF_RECORDED', evidence);

    if (!input.approved) {
      gate.state = 'BROKEN';
      gate.failure = `Rejected by ${input.reviewer}`;
      gate.endedAt = this.#clock.now();
      this.#compensate(run, 'The named reviewer rejected the rollout');
      return run;
    }

    gate.state = 'DONE';
    gate.summary = evidence;
    gate.endedAt = this.#clock.now();
    run.state = 'IN_FLIGHT';
    this.#advance(run);
    return run;
  }

  revise(runId: string, input: RevisionInput): DeliveryRun {
    const run = this.get(runId);
    if (run.state === 'COMPENSATED' || run.state === 'HALTED_BY_POLICY') {
      throw new StateConflictError('A compensated or halted run cannot be revised');
    }

    const verdict = screenAsk(input.ask);
    run.ask = input.ask;
    run.clarifiedAsk = null;
    run.revision += 1;

    if (!verdict.permitted) {
      run.state = 'HALTED_BY_POLICY';
      run.closedAt = this.#clock.now();
      this.#log(run, null, 'POLICY_HALT', verdict.reasoning);
      this.#metrics.runsClosed.inc({ state: run.state });
      return run;
    }

    run.state = 'IN_FLIGHT';
    run.closedAt = null;
    run.nodes = buildPlan();
    run.artifacts = [];
    this.#log(run, null, 'PLAN_REVISED', `Ask replaced; plan revision ${run.revision}`);
    this.#log(run, null, 'PLAN_INVALIDATED', 'Earlier outputs discarded because the ask changed');
    this.#advance(run);
    return run;
  }

  artifact(runId: string, artifactId: string): PhaseArtifact {
    const run = this.get(runId);
    const artifact = run.artifacts.find((candidate) => candidate.id === artifactId);
    if (!artifact) throw new UnknownRecordError('That artifact does not belong to this run');
    return artifact;
  }

  // ------------------------------------------------------------------ engine

  #advance(run: DeliveryRun): void {
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      if (TERMINAL_STATES.has(run.state) || run.state === 'HELD_FOR_SIGN_OFF') return;

      const ready = readyNodes(run.nodes);
      if (ready.length === 0) {
        this.#closeOut(run);
        return;
      }

      const gate = ready.find((node) => node.gated);
      if (gate) {
        gate.state = 'HELD_FOR_SIGN_OFF';
        run.state = 'HELD_FOR_SIGN_OFF';
        this.#log(run, gate.phase, 'SIGN_OFF_REQUESTED', 'Rollout needs a named person to sign off');
        return;
      }

      this.#runWave(run, ready);
    }
    this.#compensate(run, 'The engine exceeded its pass limit, which points at a malformed plan');
  }

  /** Nothing left to schedule: either everything landed, or something is stuck. */
  #closeOut(run: DeliveryRun): void {
    if (run.nodes.every((node) => node.state === 'DONE')) {
      run.state = 'DELIVERED';
      run.closedAt = this.#clock.now();
      this.#log(run, null, 'RUN_CLOSED', 'Every gate in the plan was satisfied');
      this.#recordClosure(run);
      return;
    }
    if (run.nodes.some((node) => node.state === 'BROKEN')) {
      this.#compensate(run, 'No path forward remains after a phase broke');
    }
  }

  #runWave(run: DeliveryRun, wave: PlanNode[]): void {
    for (const node of wave) {
      node.state = 'ACTIVE';
      node.tries += 1;
      node.beganAt = this.#clock.now();
      node.failure = null;
      this.#log(run, node.phase, 'NODE_ACTIVE', `attempt ${node.tries} of ${node.tryBudget}`);

      try {
        const output = workerFor(node.phase).perform(this.#briefFor(run, node));
        this.#settle(run, node, output, false);
      } catch (error) {
        this.#handleBreak(run, node, describe(error));
      }
    }
  }

  #settle(run: DeliveryRun, node: PlanNode, output: PhaseOutput, degraded: boolean): void {
    const now = this.#clock.now();
    node.state = 'DONE';
    node.summary = output.summary;
    node.endedAt = now;

    for (const file of output.files) {
      const artifact: PhaseArtifact = {
        id: newId(),
        phase: node.phase,
        path: file.path,
        format: 'markdown',
        digest: digest(file.body),
        body: file.body,
        writtenAt: now,
      };
      run.artifacts.push(artifact);
    }

    if (node.phase === 'INTAKE') run.clarifiedAsk = output.summary;
    if (degraded) {
      run.degrades += 1;
      this.#metrics.nodeDegrades.inc({ phase: node.phase });
    }

    this.#log(
      run,
      node.phase,
      degraded ? 'NODE_DEGRADED' : 'NODE_DONE',
      `confidence=${output.confidence.toFixed(2)}`,
    );
  }

  /**
   * The failure ladder: retry while the budget allows, then fall back to a
   * degraded output where the phase permits one, and only then compensate.
   */
  #handleBreak(run: DeliveryRun, node: PlanNode, reason: string): void {
    if (node.tries < node.tryBudget) {
      node.state = 'QUEUED';
      node.failure = reason;
      node.endedAt = null;
      run.retries += 1;
      this.#metrics.nodeRetries.inc({ phase: node.phase });
      this.#log(run, node.phase, 'NODE_RETRIED', `retrying after: ${reason}`);
      return;
    }

    if (node.degradable) {
      try {
        const brief = this.#briefFor(run, node);
        const worker = workerFor(node.phase);
        const output = worker.degrade
          ? worker.degrade(brief, new Error(reason))
          : degradedOutput(node.phase, new Error(reason));
        this.#settle(run, node, output, true);
        return;
      } catch (error) {
        reason = `${reason}; the fallback also failed: ${describe(error)}`;
      }
    }

    node.state = 'BROKEN';
    node.failure = reason;
    node.endedAt = this.#clock.now();
    this.#log(run, node.phase, 'NODE_BROKEN', reason);
    this.#logger.error({ runId: run.id, phase: node.phase, reason }, 'phase broke unrecoverably');
    this.#compensate(run, `Unrecoverable break at ${node.phase}`);
  }

  /** Undoes delivery work in reverse rank order, keeping the analysis intact. */
  #compensate(run: DeliveryRun, reason: string): void {
    if (run.state === 'COMPENSATED') return;
    this.#log(run, null, 'COMPENSATION_STARTED', reason);

    const undoable = run.nodes
      .filter((node) => node.state === 'DONE' && !KEEP_ON_COMPENSATION.has(node.phase))
      .sort((left, right) => right.rank - left.rank);

    for (const node of undoable) {
      node.state = 'COMPENSATED';
      node.endedAt = this.#clock.now();
      this.#log(run, node.phase, 'NODE_COMPENSATED', `rolled back ${node.phase}`);
    }

    run.compensations += 1;
    run.state = 'COMPENSATED';
    run.closedAt = this.#clock.now();
    this.#log(run, null, 'RUN_CLOSED', 'Run closed after a controlled rollback');
    this.#recordClosure(run);
  }

  #briefFor(run: DeliveryRun, node: PlanNode): PhaseBrief {
    const summaryByPhase = new Map(run.nodes.map((candidate) => [candidate.phase, candidate.summary]));
    const upstream: Partial<Record<Phase, string>> = {};
    for (const phase of node.waitsFor) {
      const summary = summaryByPhase.get(phase);
      if (summary) upstream[phase] = summary;
    }
    return {
      scenario: run.scenario,
      ask: run.ask,
      clarifiedAsk: run.clarifiedAsk,
      phase: node.phase,
      attempt: node.tries,
      upstream,
      forceBreak: run.breakPhase === node.phase,
    };
  }

  #recordClosure(run: DeliveryRun): void {
    this.#metrics.runsClosed.inc({ state: run.state });
    if (run.launchedAt && run.closedAt) {
      const seconds = (run.closedAt.getTime() - run.launchedAt.getTime()) / 1000;
      this.#metrics.runDuration.observe({ state: run.state }, seconds);
    }
    this.#logger.info(
      { runId: run.id, state: run.state, retries: run.retries, degrades: run.degrades },
      'delivery run closed',
    );
  }

  #log(run: DeliveryRun, phase: Phase | null, kind: AuditKind, note: string): void {
    run.audit.push({ id: newId(), kind, phase, note, loggedAt: this.#clock.now() });
  }
}

export type { RunState };
