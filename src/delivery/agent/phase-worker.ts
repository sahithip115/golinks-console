import type { Phase, Scenario } from '../domain/types.ts';

/** Everything a worker may see: the ask, its upstream outputs, its attempt number. */
export interface PhaseBrief {
  scenario: Scenario;
  ask: string;
  clarifiedAsk: string | null;
  phase: Phase;
  attempt: number;
  upstream: Partial<Record<Phase, string>>;
  forceBreak: boolean;
}

export interface DraftFile {
  path: string;
  body: string;
}

export interface PhaseOutput {
  summary: string;
  confidence: number;
  files: DraftFile[];
}

export interface PhaseWorker {
  phase: Phase;
  perform(brief: PhaseBrief): PhaseOutput;
  /** Bounded, deterministic reduced output used once retries are spent. */
  degrade?(brief: PhaseBrief, cause: Error): PhaseOutput;
}

export function markdown(path: string, title: string, body: string): DraftFile {
  return { path, body: `# ${title}\n\n${body}\n` };
}

export function fullOutput(summary: string, file: DraftFile): PhaseOutput {
  return { summary, confidence: 0.92, files: [file] };
}

export function degradedOutput(phase: Phase, cause: Error): PhaseOutput {
  const summary = `Reduced output for ${phase} after: ${cause.message}`;
  return {
    summary,
    confidence: 0.68,
    files: [
      markdown(
        `degraded/${phase.toLowerCase()}.md`,
        `Degraded ${phase}`,
        `${summary}\n\nThe run continued with this bounded result instead of stopping.`,
      ),
    ],
  };
}

/** Reproduces a failure on demand, which is how the console demonstrates recovery. */
export function breakIfAsked(brief: PhaseBrief, throughAttempt: number, reason: string): void {
  if (brief.forceBreak && brief.attempt <= throughAttempt) {
    throw new Error(reason);
  }
}
