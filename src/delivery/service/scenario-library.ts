import type { Scenario } from '../domain/types.ts';

export interface ScenarioPreset {
  scenario: Scenario;
  label: string;
  ask: string;
}

/** Ready-made asks so each scenario can be demonstrated without typing one. */
export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    scenario: 'NEW_BUILD',
    label: 'Build the shortcut service',
    ask:
      'Deliver a shortcut service with custom aliases, expiry, an on/off switch, ' +
      'and usage numbers that do not store personal data.',
  },
  {
    scenario: 'EXISTING_SYSTEM',
    label: 'Harden what already ships',
    ask:
      'Keep disabled and expired shortcuts from forwarding, and make releases safer ' +
      'without changing the contract existing callers depend on.',
  },
  {
    scenario: 'UNCLEAR_ASK',
    label: 'Work from a vague request',
    ask:
      'Make our links safer, keep them alive for a sensible amount of time, ' +
      'and give the business numbers it can act on.',
  },
];

export function presetFor(scenario: Scenario): ScenarioPreset {
  const preset = SCENARIO_PRESETS.find((candidate) => candidate.scenario === scenario);
  if (!preset) throw new Error(`No preset defined for ${scenario}`);
  return preset;
}
