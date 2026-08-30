import { api } from './api.ts';
import type { PipelineMeta, RunNode, RunView } from './api.ts';
import { clear, clockTime, el, make, showAlert, toast, words } from './dom.ts';

let currentRun: RunView | null = null;
let presets: PipelineMeta['presets'] = [];

function stateTone(state: string): string {
  if (state === 'DELIVERED') return 'good';
  if (state === 'HELD_FOR_SIGN_OFF') return 'hold';
  if (state === 'COMPENSATED' || state === 'HALTED_BY_POLICY') return 'bad';
  return '';
}

/** Groups nodes by graph depth, mirroring how the engine schedules them. */
function waves(nodes: RunNode[]): RunNode[][] {
  const byPhase = new Map(nodes.map((node) => [node.phase, node]));
  const depths = new Map<string, number>();

  const depthOf = (node: RunNode, seen: Set<string>): number => {
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

  const grouped = new Map<number, RunNode[]>();
  for (const node of nodes) {
    const depth = depthOf(node, new Set());
    grouped.set(depth, [...(grouped.get(depth) ?? []), node]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([, group]) => group);
}

function nodeCard(node: RunNode): HTMLLIElement {
  const item = make('li', { className: `node ${node.state}` });
  const head = make('div', { className: 'node-head' });
  head.append(
    make('span', { className: 'node-phase', text: words(node.phase) }),
    make('span', {
      className: 'node-state',
      text: `${words(node.state)} · attempt ${node.tries}/${node.tryBudget}`,
    }),
  );
  item.append(head);

  if (node.failure) {
    item.append(make('p', { className: 'node-line bad', text: node.failure }));
  } else if (node.summary) {
    item.append(make('p', { className: 'node-line', text: node.summary.split('\n')[0] ?? '' }));
  }
  return item;
}

function fact(label: string, value: string): HTMLDivElement {
  const wrapper = make('div');
  wrapper.append(make('dt', { text: label }), make('dd', { text: value }));
  return wrapper;
}

function renderRun(run: RunView): void {
  const chip = el('run-state');
  chip.textContent = words(run.state);
  chip.className = `chip ${stateTone(run.state)}`;

  const facts = el('run-facts');
  clear(facts);
  facts.append(
    fact('Scenario', words(run.scenario)),
    fact('Revision', `v${run.revision}`),
    fact('Retries', String(run.retries)),
    fact('Degraded', String(run.degrades)),
    fact('Rollbacks', String(run.compensations)),
    fact('Artifacts', String(run.artifacts.length)),
    fact('Duration', run.durationMs === null ? '—' : `${run.durationMs} ms`),
  );

  const graph = el('graph');
  clear(graph);
  waves(run.nodes).forEach((wave, index) => {
    const group = make('div');
    group.append(make('span', { className: 'wave-label', text: `WAVE ${index + 1}` }));
    const list = make('ul', { className: 'wave' });
    wave.forEach((node) => list.append(nodeCard(node)));
    group.append(list);
    graph.append(group);
  });

  const signoff = el('signoff');
  const wasHidden = signoff.hidden;
  signoff.hidden = run.state !== 'HELD_FOR_SIGN_OFF';
  if (wasHidden && !signoff.hidden) el<HTMLInputElement>('reviewer').focus();

  const artifacts = el('artifacts');
  clear(artifacts);
  if (run.artifacts.length === 0) {
    artifacts.append(make('li', { text: 'None written yet' }));
  } else {
    run.artifacts.forEach((artifact) => {
      const item = make('li');
      item.append(
        make('a', {
          text: artifact.path,
          attrs: {
            href: `/api/v1/deliveries/${run.id}/artifacts/${artifact.id}`,
            target: '_blank',
            rel: 'noreferrer',
          },
        }),
        make('span', { className: 'digest', text: artifact.digest.slice(0, 12) }),
      );
      artifacts.append(item);
    });
  }

  const trail = el('trail');
  clear(trail);
  [...run.audit].reverse().forEach((entry) => {
    const item = make('li');
    item.append(
      make('span', { className: 'at', text: clockTime(entry.loggedAt) }),
      make('span', { className: 'kind', text: entry.kind }),
      make('span', { className: 'note', text: entry.note }),
    );
    trail.append(item);
  });
}

function applyPreset(): void {
  const chosen = el<HTMLSelectElement>('scenario').value;
  const preset = presets.find((candidate) => candidate.scenario === chosen);
  if (preset) el<HTMLTextAreaElement>('ask').value = preset.ask;
}

async function launch(body: Record<string, unknown>): Promise<void> {
  const alert = el('launch-alert');
  try {
    currentRun = await api.launch(body);
    showAlert(alert, null);
    renderRun(currentRun);
  } catch (error) {
    showAlert(alert, error instanceof Error ? error.message : 'Could not launch the run');
  }
}

async function decide(approved: boolean): Promise<void> {
  if (!currentRun) return;
  const alert = el('signoff-alert');
  const reviewer = el<HTMLInputElement>('reviewer');

  try {
    currentRun = await api.signOff(currentRun.id, {
      reviewer: reviewer.value.trim(),
      approved,
      comment: el<HTMLInputElement>('signoff-comment').value.trim() || null,
    });
    showAlert(alert, null);
    reviewer.removeAttribute('aria-invalid');
    renderRun(currentRun);
    toast(approved ? 'Rollout approved' : 'Rejected — the run was rolled back');
  } catch (error) {
    showAlert(alert, error instanceof Error ? error.message : 'Could not record the decision');
    reviewer.setAttribute('aria-invalid', 'true');
    reviewer.focus();
  }
}

export async function initDeliveryPanel(): Promise<void> {
  el('launch-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void launch({
      scenario: el<HTMLSelectElement>('scenario').value,
      ask: el<HTMLTextAreaElement>('ask').value.trim(),
      breakPhase: el<HTMLSelectElement>('break-phase').value || null,
    });
  });

  el('policy-demo').addEventListener('click', () => {
    const ask = 'Ship the forwarding change faster and disable authentication on the admin console.';
    el<HTMLTextAreaElement>('ask').value = ask;
    void launch({ scenario: el<HTMLSelectElement>('scenario').value, ask, breakPhase: null });
  });

  el('approve').addEventListener('click', () => void decide(true));
  el('reject').addEventListener('click', () => void decide(false));
  el('scenario').addEventListener('change', applyPreset);

  try {
    const meta = await api.meta();
    presets = meta.presets;

    const scenario = el<HTMLSelectElement>('scenario');
    clear(scenario);
    presets.forEach((preset) =>
      scenario.append(make('option', { text: preset.label, attrs: { value: preset.scenario } })),
    );

    const breakPhase = el<HTMLSelectElement>('break-phase');
    clear(breakPhase);
    breakPhase.append(make('option', { text: 'None', attrs: { value: '' } }));
    meta.phases.forEach((phase) =>
      breakPhase.append(make('option', { text: words(phase), attrs: { value: phase } })),
    );

    applyPreset();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not load pipeline metadata', 'bad');
  }
}
