import type { Shortcut } from '../domain/shortcut.ts';

/** The wire shape of a shortcut. Dates are ISO strings; internal ids stay internal. */
export interface ShortcutView {
  code: string;
  shortUrl: string;
  destination: string;
  owner: string;
  note: string | null;
  enabled: boolean;
  retired: boolean;
  useCount: number;
  createdAt: string;
  retiresAt: string;
  lastUsedAt: string | null;
}

export interface DirectoryTally {
  total: number;
  live: number;
  disabled: number;
  retired: number;
  uses: number;
}

export interface UsageReport {
  code: string;
  destination: string;
  enabled: boolean;
  retired: boolean;
  totalUses: number;
  usesLastDay: number;
  distinctVisitors: number;
  topSources: Array<{ host: string; uses: number }>;
  recentUses: Array<{ happenedAt: string; sourceHost: string | null }>;
  createdAt: string;
  retiresAt: string;
}

export function toShortcutView(shortcut: Shortcut, shortUrl: string, retired: boolean): ShortcutView {
  return {
    code: shortcut.code,
    shortUrl,
    destination: shortcut.destination,
    owner: shortcut.owner,
    note: shortcut.note,
    enabled: shortcut.enabled,
    retired,
    useCount: shortcut.useCount,
    createdAt: shortcut.createdAt.toISOString(),
    retiresAt: shortcut.retiresAt.toISOString(),
    lastUsedAt: shortcut.lastUsedAt?.toISOString() ?? null,
  };
}
