import type { Shortcut, UsageHit } from '../domain/shortcut.ts';

/**
 * The service only ever talks to this interface, so the in-memory store below
 * can be replaced by a database without touching any business logic.
 */
export interface ShortcutRepository {
  save(shortcut: Shortcut): Shortcut;
  findByCode(code: string): Shortcut | undefined;
  exists(code: string): boolean;
  listNewestFirst(): Shortcut[];
  recordHit(hit: UsageHit): void;
  hitsFor(code: string): UsageHit[];
  countHitsSince(code: string, since: Date): number;
}

export class InMemoryShortcutRepository implements ShortcutRepository {
  readonly #shortcuts = new Map<string, Shortcut>();
  readonly #hits = new Map<string, UsageHit[]>();

  save(shortcut: Shortcut): Shortcut {
    const stored = Object.freeze({ ...shortcut });
    this.#shortcuts.set(stored.code, stored);
    return stored;
  }

  findByCode(code: string): Shortcut | undefined {
    return this.#shortcuts.get(code);
  }

  exists(code: string): boolean {
    return this.#shortcuts.has(code);
  }

  listNewestFirst(): Shortcut[] {
    return [...this.#shortcuts.values()].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );
  }

  recordHit(hit: UsageHit): void {
    const bucket = this.#hits.get(hit.code);
    if (bucket) {
      bucket.push(hit);
      return;
    }
    this.#hits.set(hit.code, [hit]);
  }

  hitsFor(code: string): UsageHit[] {
    return this.#hits.get(code) ?? [];
  }

  countHitsSince(code: string, since: Date): number {
    return this.hitsFor(code).filter((hit) => hit.happenedAt.getTime() >= since.getTime()).length;
  }
}
