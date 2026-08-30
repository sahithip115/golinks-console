import type { AppConfig } from '../../config.ts';
import type { Clock } from '../../shared/clock.ts';
import { StateConflictError, UnknownRecordError } from '../../shared/errors.ts';
import { fingerprint, newId, randomCode } from '../../shared/ids.ts';
import type { Metrics } from '../../shared/metrics.ts';
import type { NewShortcutInput, ShortcutPatchInput } from '../api/schemas.ts';
import type { DirectoryTally, ShortcutView, UsageReport } from '../api/views.ts';
import { toShortcutView } from '../api/views.ts';
import { extended, hasRetired, isUsable, retirementFrom } from '../domain/shortcut.ts';
import type { Shortcut } from '../domain/shortcut.ts';
import type { ShortcutRepository } from '../repository/shortcut-repository.ts';
import {
  normaliseAlias,
  referrerHost,
  requireForwardableUrl,
  requireLifetime,
} from './destination-rules.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_ATTEMPTS = 12;

export interface ForwardContext {
  address?: string | undefined;
  agent?: string | undefined;
  referrer?: string | undefined;
}

/** Everything the shortcut half of the product can do, stated once. */
export class ShortcutService {
  readonly #repository: ShortcutRepository;
  readonly #clock: Clock;
  readonly #config: AppConfig;
  readonly #metrics: Metrics;

  constructor(repository: ShortcutRepository, clock: Clock, config: AppConfig, metrics: Metrics) {
    this.#repository = repository;
    this.#clock = clock;
    this.#config = config;
    this.#metrics = metrics;
  }

  register(input: NewShortcutInput): ShortcutView {
    const destination = requireForwardableUrl(input.url);
    const alias = normaliseAlias(input.alias);
    const lifetime = requireLifetime(
      input.lifetimeDays,
      this.#config.defaultLifetimeDays,
      this.#config.maxLifetimeDays,
    );
    const now = this.#clock.now();

    const shortcut: Shortcut = {
      id: newId(),
      code: this.#claimCode(alias),
      destination,
      owner: input.owner?.trim() || 'unassigned',
      note: input.note?.trim() || null,
      enabled: true,
      useCount: 0,
      createdAt: now,
      retiresAt: retirementFrom(now, lifetime),
      lastUsedAt: null,
    };

    this.#metrics.shortcutsCreated.inc();
    return this.#present(this.#repository.save(shortcut));
  }

  directory(search?: string): { tally: DirectoryTally; shortcuts: ShortcutView[] } {
    const all = this.#repository.listNewestFirst();
    const needle = search?.trim().toLowerCase() ?? '';
    const matched = needle === '' ? all : all.filter((shortcut) => this.#matches(shortcut, needle));
    return { tally: this.#tally(all), shortcuts: matched.map((shortcut) => this.#present(shortcut)) };
  }

  read(code: string): ShortcutView {
    return this.#present(this.#require(code));
  }

  /**
   * Resolves a code for forwarding. A shortcut that is switched off or past its
   * retirement date is reported as missing, so nothing leaks about where it went.
   */
  forward(code: string, context: ForwardContext = {}): string {
    const shortcut = this.#require(code);
    const now = this.#clock.now();

    if (!isUsable(shortcut, now)) {
      this.#metrics.forwards.inc({ outcome: shortcut.enabled ? 'retired' : 'disabled' });
      throw new UnknownRecordError(`Shortcut "${shortcut.code}" is no longer available`);
    }

    this.#repository.save({ ...shortcut, useCount: shortcut.useCount + 1, lastUsedAt: now });
    this.#repository.recordHit({
      id: newId(),
      code: shortcut.code,
      happenedAt: now,
      visitorFingerprint: fingerprint(context.address),
      agentFingerprint: fingerprint(context.agent),
      sourceHost: referrerHost(context.referrer),
    });
    this.#metrics.forwards.inc({ outcome: 'forwarded' });
    return shortcut.destination;
  }

  amend(code: string, patch: ShortcutPatchInput): ShortcutView {
    let shortcut = this.#require(code);

    if (patch.enabled !== null && patch.enabled !== undefined) {
      shortcut = { ...shortcut, enabled: patch.enabled };
    }
    if (patch.extendByDays !== null && patch.extendByDays !== undefined) {
      const days = requireLifetime(
        patch.extendByDays,
        this.#config.defaultLifetimeDays,
        this.#config.maxLifetimeDays,
      );
      shortcut = extended(shortcut, days, this.#clock.now());
    }
    return this.#present(this.#repository.save(shortcut));
  }

  /** A soft delete: the record survives so its history and destination stay auditable. */
  retire(code: string): ShortcutView {
    const shortcut = this.#require(code);
    return this.#present(this.#repository.save({ ...shortcut, enabled: false }));
  }

  usage(code: string): UsageReport {
    const shortcut = this.#require(code);
    const now = this.#clock.now();
    const hits = this.#repository.hitsFor(shortcut.code);

    const sources = new Map<string, number>();
    const visitors = new Set<string>();
    for (const hit of hits) {
      if (hit.sourceHost) sources.set(hit.sourceHost, (sources.get(hit.sourceHost) ?? 0) + 1);
      if (hit.visitorFingerprint) visitors.add(hit.visitorFingerprint);
    }

    return {
      code: shortcut.code,
      destination: shortcut.destination,
      enabled: shortcut.enabled,
      retired: hasRetired(shortcut, now),
      totalUses: hits.length,
      usesLastDay: this.#repository.countHitsSince(shortcut.code, new Date(now.getTime() - DAY_MS)),
      distinctVisitors: visitors.size,
      topSources: [...sources.entries()]
        .map(([host, uses]) => ({ host, uses }))
        .sort((left, right) => right.uses - left.uses)
        .slice(0, 5),
      recentUses: hits
        .slice(-10)
        .reverse()
        .map((hit) => ({ happenedAt: hit.happenedAt.toISOString(), sourceHost: hit.sourceHost })),
      createdAt: shortcut.createdAt.toISOString(),
      retiresAt: shortcut.retiresAt.toISOString(),
    };
  }

  #matches(shortcut: Shortcut, needle: string): boolean {
    return [shortcut.code, shortcut.destination, shortcut.owner, shortcut.note ?? ''].some((field) =>
      field.toLowerCase().includes(needle),
    );
  }

  #tally(all: Shortcut[]): DirectoryTally {
    const now = this.#clock.now();
    return {
      total: all.length,
      live: all.filter((shortcut) => isUsable(shortcut, now)).length,
      disabled: all.filter((shortcut) => !shortcut.enabled).length,
      retired: all.filter((shortcut) => hasRetired(shortcut, now)).length,
      uses: all.reduce((sum, shortcut) => sum + shortcut.useCount, 0),
    };
  }

  #claimCode(alias: string | null): string {
    if (alias !== null) {
      if (this.#repository.exists(alias)) {
        throw new StateConflictError(`Alias "${alias}" is already taken`);
      }
      return alias;
    }
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const candidate = randomCode();
      if (!this.#repository.exists(candidate)) return candidate;
    }
    throw new StateConflictError('Could not mint a free shortcut code — please supply an alias');
  }

  #require(code: string): Shortcut {
    const key = code.trim().toLowerCase();
    const shortcut = this.#repository.findByCode(key);
    if (!shortcut) {
      throw new UnknownRecordError(`No shortcut is registered for "${key}"`);
    }
    return shortcut;
  }

  #present(shortcut: Shortcut): ShortcutView {
    const shortUrl = `${this.#config.baseUrl}${this.#config.redirectPrefix}/${shortcut.code}`;
    return toShortcutView(shortcut, shortUrl, hasRetired(shortcut, this.#clock.now()));
  }
}
