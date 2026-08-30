import { RejectedInputError } from '../../shared/errors.ts';

/**
 * Every "is this allowed" question about user-supplied values, kept together so
 * the security-relevant rules can be read and tested on their own.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const RESERVED_CODES = new Set(['api', 'go', 'admin', 'assets', 'health', 'metrics', 'index']);
const ALIAS_SHAPE = /^[a-z0-9][a-z0-9_-]{2,30}[a-z0-9]$/;

const PRIVATE_RANGES = [
  /^10(\.\d{1,3}){3}$/,
  /^127(\.\d{1,3}){3}$/,
  /^169\.254(\.\d{1,3}){2}$/,
  /^172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}$/,
  /^192\.168(\.\d{1,3}){2}$/,
];

function isInternalHost(host: string): boolean {
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  return PRIVATE_RANGES.some((range) => range.test(host));
}

/** Returns the canonical destination, or explains why it cannot be stored. */
export function requireForwardableUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw RejectedInputError.field('url', 'A destination URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw RejectedInputError.field('url', 'Destination URL is malformed');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw RejectedInputError.field('url', 'Only http and https destinations can be shortened');
  }

  const host = parsed.hostname.toLowerCase();
  if (host === '') {
    throw RejectedInputError.field('url', 'Destination URL is missing a host');
  }
  if (isInternalHost(host)) {
    throw RejectedInputError.field('url', 'Internal and loopback destinations are refused');
  }
  return parsed.toString();
}

/** Normalises an optional alias to lower case, or returns null when none was given. */
export function normaliseAlias(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;

  const alias = raw.trim().toLowerCase();
  if (!ALIAS_SHAPE.test(alias)) {
    throw RejectedInputError.field(
      'alias',
      'Alias must be 4-32 characters of letters, digits, hyphen or underscore, ' +
        'starting and ending with a letter or digit',
    );
  }
  if (RESERVED_CODES.has(alias)) {
    throw RejectedInputError.field('alias', `Alias "${alias}" is reserved by the platform`);
  }
  return alias;
}

export function requireLifetime(
  requested: number | null | undefined,
  fallbackDays: number,
  ceilingDays: number,
): number {
  const days = requested ?? fallbackDays;
  if (!Number.isInteger(days) || days < 1 || days > ceilingDays) {
    throw RejectedInputError.field(
      'lifetimeDays',
      `Lifetime must be a whole number of days between 1 and ${ceilingDays}`,
    );
  }
  return days;
}

/** Only the host of a referrer is kept — a full URL can carry private context. */
export function referrerHost(referrer: string | undefined | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname || null;
  } catch {
    return null;
  }
}
