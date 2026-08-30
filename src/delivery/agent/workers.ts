import type { Phase } from '../domain/types.ts';
import type { PhaseWorker } from './phase-worker.ts';
import { breakIfAsked, fullOutput, markdown } from './phase-worker.ts';

/**
 * The phase workers. They are deterministic on purpose — what is being shown is
 * the control flow around them, not the prose they produce.
 */
const workers: PhaseWorker[] = [
  {
    phase: 'INTAKE',
    perform(brief) {
      breakIfAsked(brief, 1, 'Intake could not settle on a single interpretation of the ask');
      const summary = [
        `Goal: a governed change to the shortcut service (${brief.scenario}).`,
        `In scope: ${brief.ask}`,
        'Assumptions: 30-day default lifetime, http/https destinations only, fingerprinted usage records, ' +
          'a named person signs off before rollout.',
        'Still open: how long usage history is kept, custom domains, abuse throttling.',
      ].join('\n');
      return fullOutput(summary, markdown('intake/clarified-ask.md', 'Clarified Ask', summary));
    },
  },
  {
    phase: 'DESIGN',
    perform(brief) {
      const summary = [
        'Shape: one deployable service with two independent modules — shortcut and delivery.',
        'Storage sits behind a repository interface, so the in-memory store can become a database ' +
          'without touching business logic.',
        'Control flow: a plan graph, with design and threat review able to run side by side.',
        `Carried forward from intake: ${brief.upstream.INTAKE?.split('\n')[0] ?? 'no intake output'}`,
      ].join('\n');
      return fullOutput(summary, markdown('design/shape.md', 'Design', summary));
    },
  },
  {
    phase: 'THREAT_REVIEW',
    perform() {
      const summary = [
        'Destination rules: http/https only, internal and loopback hosts refused, reserved aliases held back.',
        'Usage records keep truncated digests of address and agent plus the referrer host — never raw values.',
        'Responses carry nosniff, frame-deny and no-referrer; forwards are marked no-store.',
        'Change control: the ask is screened, then a named person signs off before rollout.',
      ].join('\n');
      return fullOutput(summary, markdown('threat-review/controls.md', 'Threat Review', summary));
    },
  },
  {
    phase: 'BUILD',
    perform(brief) {
      breakIfAsked(brief, 2, 'Build could not resolve the dependency set');
      const summary = [
        '1. Shortcut endpoints: register, directory search, read, usage, patch, retire.',
        '2. Forwarding at /go/{code}, writing a usage record on the way through.',
        '3. Delivery engine: plan waves, bounded retries, degraded fallback, compensation.',
        `Scenario under build: ${brief.scenario}`,
      ].join('\n');
      return fullOutput(summary, markdown('build/plan.md', 'Build Plan', summary));
    },
  },
  {
    phase: 'UNIT_CHECKS',
    perform() {
      const summary =
        'Unit checks cover destination rules, alias shape, lifetime arithmetic, code minting, ' +
        'and the readiness filter that decides which nodes may start.';
      return fullOutput(summary, markdown('checks/unit.md', 'Unit Checks', summary));
    },
  },
  {
    phase: 'SYSTEM_CHECKS',
    perform() {
      const summary =
        'System checks drive the HTTP surface: register then forward then usage, disabled and retired ' +
        'codes answer 404, the policy halt, the sign-off gate, and compensation on rejection.';
      return fullOutput(summary, markdown('checks/system.md', 'System Checks', summary));
    },
  },
  {
    phase: 'DOCUMENTATION',
    perform() {
      const summary =
        'Documentation set: README with run steps, assumptions and trade-offs, plus architecture ' +
        'notes, the scenario walkthrough, and the decision record.';
      return fullOutput(summary, markdown('documentation/index.md', 'Documentation', summary));
    },
  },
  {
    phase: 'GO_NO_GO',
    perform() {
      const summary = [
        'Checks green and recorded.',
        'Artifacts written with digests.',
        'Threat review attached to the run.',
        'Compensation path defined for every phase after design.',
        'Outstanding: the named sign-off.',
      ].join('\n');
      return fullOutput(summary, markdown('rollout/go-no-go.md', 'Go / No-Go', summary));
    },
  },
  {
    // Never executed by the engine: this node waits for a person, and the API completes it.
    phase: 'SIGN_OFF',
    perform() {
      const summary = 'Held for a named reviewer.';
      return fullOutput(summary, markdown('rollout/sign-off.md', 'Sign-off', summary));
    },
  },
  {
    phase: 'ROLLOUT',
    perform() {
      const summary =
        'Rollout is simulated: no external environment is touched. The audit trail is the evidence ' +
        'that every gate was satisfied in order.';
      return fullOutput(summary, markdown('rollout/evidence.md', 'Rollout Evidence', summary));
    },
  },
];

const directory = new Map<Phase, PhaseWorker>(workers.map((worker) => [worker.phase, worker]));

export function workerFor(phase: Phase): PhaseWorker {
  const worker = directory.get(phase);
  if (!worker) {
    // A missing worker is a wiring bug, not a runtime condition.
    throw new Error(`No worker is registered for phase ${phase}`);
  }
  return worker;
}
