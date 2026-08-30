/** Phases a change passes through. The plan graph, not this order, decides execution. */
export const PHASES = [
  'INTAKE',
  'DESIGN',
  'THREAT_REVIEW',
  'BUILD',
  'UNIT_CHECKS',
  'SYSTEM_CHECKS',
  'DOCUMENTATION',
  'GO_NO_GO',
  'SIGN_OFF',
  'ROLLOUT',
] as const;
export type Phase = (typeof PHASES)[number];

export const SCENARIOS = ['NEW_BUILD', 'EXISTING_SYSTEM', 'UNCLEAR_ASK'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type NodeState = 'QUEUED' | 'ACTIVE' | 'DONE' | 'BROKEN' | 'HELD_FOR_SIGN_OFF' | 'COMPENSATED';

export type RunState =
  | 'IN_FLIGHT'
  | 'HELD_FOR_SIGN_OFF'
  | 'DELIVERED'
  | 'COMPENSATED'
  | 'HALTED_BY_POLICY';

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set<RunState>([
  'DELIVERED',
  'COMPENSATED',
  'HALTED_BY_POLICY',
]);

/** Every state change appends one of these; together they are the run's audit trail. */
export type AuditKind =
  | 'RUN_DRAFTED'
  | 'RUN_LAUNCHED'
  | 'POLICY_HALT'
  | 'NODE_ACTIVE'
  | 'NODE_DONE'
  | 'NODE_RETRIED'
  | 'NODE_DEGRADED'
  | 'NODE_BROKEN'
  | 'NODE_COMPENSATED'
  | 'SIGN_OFF_REQUESTED'
  | 'SIGN_OFF_RECORDED'
  | 'PLAN_REVISED'
  | 'PLAN_INVALIDATED'
  | 'COMPENSATION_STARTED'
  | 'RUN_CLOSED';

export interface PlanNode {
  id: string;
  phase: Phase;
  rank: number;
  state: NodeState;
  tries: number;
  tryBudget: number;
  gated: boolean;
  degradable: boolean;
  waitsFor: Phase[];
  summary: string | null;
  failure: string | null;
  beganAt: Date | null;
  endedAt: Date | null;
}

export interface AuditEntry {
  id: string;
  kind: AuditKind;
  phase: Phase | null;
  note: string;
  loggedAt: Date;
}

export interface PhaseArtifact {
  id: string;
  phase: Phase;
  path: string;
  format: 'markdown';
  digest: string;
  body: string;
  writtenAt: Date;
}

export interface DeliveryRun {
  id: string;
  scenario: Scenario;
  ask: string;
  clarifiedAsk: string | null;
  state: RunState;
  revision: number;
  retries: number;
  degrades: number;
  compensations: number;
  breakPhase: Phase | null;
  draftedAt: Date;
  launchedAt: Date | null;
  closedAt: Date | null;
  nodes: PlanNode[];
  audit: AuditEntry[];
  artifacts: PhaseArtifact[];
}
