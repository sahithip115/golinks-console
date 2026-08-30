/**
 * Failures the API knows how to describe. Each carries the status and a stable
 * machine-readable code, so the error handler stays a single small function.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly fields: Readonly<Record<string, string>>;

  protected constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = new.target.name;
    this.fields = Object.freeze({ ...fields });
    Error.captureStackTrace?.(this, new.target);
  }
}

/** A value the domain refuses: bad URL, malformed alias, lifetime out of range. */
export class RejectedInputError extends AppError {
  readonly status = 400;
  readonly code = 'rejected_input';

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message, fields);
  }

  static field(field: string, message: string): RejectedInputError {
    return new RejectedInputError(message, { [field]: message });
  }
}

/** Nothing exists behind the identifier the caller used. */
export class UnknownRecordError extends AppError {
  readonly status = 404;
  readonly code = 'unknown_record';

  constructor(message: string) {
    super(message);
  }
}

/** Well-formed, but it clashes with what is already stored. */
export class StateConflictError extends AppError {
  readonly status = 409;
  readonly code = 'state_conflict';

  constructor(message: string) {
    super(message);
  }
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
