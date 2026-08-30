import { newId } from '../../shared/ids.ts';
import type { Phase, PlanNode } from './types.ts';

interface Blueprint {
  rank: number;
  phase: Phase;
  waitsFor: Phase[];
  gated?: boolean;
  degradable?: boolean;
}

/**
 * The plan declared as rows of (rank, phase, prerequisites). Design and threat
 * review share a wave behind intake; checks and documentation fan out from
 * build; go/no-go joins them; rollout waits on a human.
 */
const BLUEPRINT: readonly Blueprint[] = [
  { rank: 10, phase: 'INTAKE', waitsFor: [], degradable: true },
  { rank: 20, phase: 'DESIGN', waitsFor: ['INTAKE'], degradable: true },
  { rank: 25, phase: 'THREAT_REVIEW', waitsFor: ['INTAKE'], degradable: true },
  { rank: 30, phase: 'BUILD', waitsFor: ['DESIGN', 'THREAT_REVIEW'], degradable: true },
  { rank: 40, phase: 'UNIT_CHECKS', waitsFor: ['BUILD'] },
  { rank: 45, phase: 'SYSTEM_CHECKS', waitsFor: ['BUILD'] },
  { rank: 50, phase: 'DOCUMENTATION', waitsFor: ['BUILD'], degradable: true },
  { rank: 60, phase: 'GO_NO_GO', waitsFor: ['UNIT_CHECKS', 'SYSTEM_CHECKS', 'DOCUMENTATION'] },
  { rank: 70, phase: 'SIGN_OFF', waitsFor: ['GO_NO_GO'], gated: true },
  { rank: 80, phase: 'ROLLOUT', waitsFor: ['SIGN_OFF'] },
];

export function buildPlan(): PlanNode[] {
  return BLUEPRINT.map((row) => ({
    id: newId(),
    phase: row.phase,
    rank: row.rank,
    state: 'QUEUED',
    tries: 0,
    tryBudget: 2,
    gated: row.gated ?? false,
    degradable: row.degradable ?? false,
    waitsFor: [...row.waitsFor],
    summary: null,
    failure: null,
    beganAt: null,
    endedAt: null,
  }));
}

/** Nodes whose prerequisites have all finished, lowest rank first. */
export function readyNodes(nodes: PlanNode[]): PlanNode[] {
  const stateByPhase = new Map(nodes.map((node) => [node.phase, node.state]));
  return nodes
    .filter((node) => node.state === 'QUEUED')
    .filter((node) => node.waitsFor.every((phase) => stateByPhase.get(phase) === 'DONE'))
    .sort((left, right) => left.rank - right.rank);
}

/** Groups the plan into dependency depths, which is how the console draws it. */
export function waves(nodes: PlanNode[]): PlanNode[][] {
  const byPhase = new Map(nodes.map((node) => [node.phase, node]));
  const depths = new Map<Phase, number>();

  const depthOf = (node: PlanNode, seen: Set<Phase>): number => {
    const cached = depths.get(node.phase);
    if (cached !== undefined) return cached;
    if (seen.has(node.phase)) return 0;
    seen.add(node.phase);

    const depth = node.waitsFor.reduce((deepest, phase) => {
      const parent = byPhase.get(phase);
      return parent ? Math.max(deepest, depthOf(parent, seen) + 1) : deepest;
    }, 0);
    depths.set(node.phase, depth);
    return depth;
  };

  const grouped = new Map<number, PlanNode[]>();
  for (const node of nodes) {
    const depth = depthOf(node, new Set());
    grouped.set(depth, [...(grouped.get(depth) ?? []), node]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}
