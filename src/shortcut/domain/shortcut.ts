/** One shortcut: the code people type, where it points, and how long it lives. */
export interface Shortcut {
  readonly id: string;
  readonly code: string;
  readonly destination: string;
  readonly owner: string;
  readonly note: string | null;
  readonly enabled: boolean;
  readonly useCount: number;
  readonly createdAt: Date;
  readonly retiresAt: Date;
  readonly lastUsedAt: Date | null;
}

/**
 * One forwarded visit. Only fingerprints are kept, so usage can be counted
 * without holding anything that identifies a person.
 */
export interface UsageHit {
  readonly id: string;
  readonly code: string;
  readonly happenedAt: Date;
  readonly visitorFingerprint: string | null;
  readonly agentFingerprint: string | null;
  readonly sourceHost: string | null;
}

export function hasRetired(shortcut: Shortcut, now: Date): boolean {
  return shortcut.retiresAt.getTime() <= now.getTime();
}

/** True only when the shortcut would actually forward a visitor right now. */
export function isUsable(shortcut: Shortcut, now: Date): boolean {
  return shortcut.enabled && !hasRetired(shortcut, now);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Extends from whichever is later — the current expiry, or now. */
export function extended(shortcut: Shortcut, days: number, now: Date): Shortcut {
  const anchor = Math.max(shortcut.retiresAt.getTime(), now.getTime());
  return { ...shortcut, retiresAt: new Date(anchor + days * DAY_MS) };
}

export function retirementFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}
