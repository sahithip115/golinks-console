import type { DeliveryRun } from '../domain/types.ts';

/** Wire shapes. Artifact bodies are fetched on demand, never inlined into a run. */
export function toRunView(run: DeliveryRun, now: Date): Record<string, unknown> {
  return {
    id: run.id,
    scenario: run.scenario,
    state: run.state,
    revision: run.revision,
    ask: run.ask,
    clarifiedAsk: run.clarifiedAsk,
    breakPhase: run.breakPhase,
    retries: run.retries,
    degrades: run.degrades,
    compensations: run.compensations,
    durationMs: run.launchedAt
      ? (run.closedAt ?? now).getTime() - run.launchedAt.getTime()
      : null,
    draftedAt: run.draftedAt.toISOString(),
    launchedAt: run.launchedAt?.toISOString() ?? null,
    closedAt: run.closedAt?.toISOString() ?? null,
    nodes: run.nodes.map((node) => ({
      phase: node.phase,
      state: node.state,
      rank: node.rank,
      tries: node.tries,
      tryBudget: node.tryBudget,
      gated: node.gated,
      waitsFor: node.waitsFor,
      summary: node.summary,
      failure: node.failure,
      beganAt: node.beganAt?.toISOString() ?? null,
      endedAt: node.endedAt?.toISOString() ?? null,
    })),
    audit: run.audit.map((entry) => ({
      kind: entry.kind,
      phase: entry.phase,
      note: entry.note,
      loggedAt: entry.loggedAt.toISOString(),
    })),
    artifacts: run.artifacts.map((artifact) => ({
      id: artifact.id,
      phase: artifact.phase,
      path: artifact.path,
      format: artifact.format,
      digest: artifact.digest,
      writtenAt: artifact.writtenAt.toISOString(),
    })),
  };
}

export function toRunSummary(run: DeliveryRun): Record<string, unknown> {
  return {
    id: run.id,
    scenario: run.scenario,
    state: run.state,
    revision: run.revision,
    ask: run.ask,
    draftedAt: run.draftedAt.toISOString(),
    phasesDone: run.nodes.filter((node) => node.state === 'DONE').length,
    phasesTotal: run.nodes.length,
  };
}
