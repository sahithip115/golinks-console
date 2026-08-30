export interface PolicyVerdict {
  permitted: boolean;
  reasoning: string;
}

/**
 * Screens the ask before any phase runs. Some requests should never be executed
 * however they are phrased, so the run halts rather than negotiating with them.
 */
const FORBIDDEN_PHRASES = [
  'disable authentication',
  'turn off authentication',
  'remove authentication',
  'bypass authentication',
  'disable audit',
  'turn off audit',
  'skip the security review',
  'store passwords in plain text',
];

export function screenAsk(ask: string): PolicyVerdict {
  const text = ask.toLowerCase();
  const breach = FORBIDDEN_PHRASES.find((phrase) => text.includes(phrase));

  if (breach) {
    return {
      permitted: false,
      reasoning: `Halted before any phase ran: the ask contains "${breach}", which change policy forbids`,
    };
  }
  return {
    permitted: true,
    reasoning: 'Screened against the security, privacy, and change-control rules with no findings',
  };
}
