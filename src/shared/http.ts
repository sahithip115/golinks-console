import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ZodType } from 'zod';
import { AppError, RejectedInputError } from './errors.ts';

/**
 * Parses a request part with a Zod schema and re-throws failures as the domain's
 * own rejection, so validation errors and business errors share one wire shape.
 */
export function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : 'body';
        fields[key] ??= issue.message;
      }
      const first = error.issues[0];
      throw new RejectedInputError(first?.message ?? 'Request failed validation', fields);
    }
    throw error;
  }
}

export interface FailureBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId: string;
  occurredAt: string;
}

/**
 * One error shape for every failure, always carrying the request id so a user
 * can quote it and the matching log line can be found.
 */
export function toFailure(error: unknown, request: FastifyRequest): { status: number; body: FailureBody } {
  const requestId = request.id;
  const occurredAt = new Date().toISOString();

  if (error instanceof AppError) {
    const body: FailureBody = { code: error.code, message: error.message, requestId, occurredAt };
    if (Object.keys(error.fields).length > 0) body.fields = { ...error.fields };
    return { status: error.status, body };
  }

  const status = (error as { statusCode?: number })?.statusCode;
  if (status === 400) {
    return {
      status: 400,
      body: { code: 'unreadable_body', message: 'Request body is not valid JSON', requestId, occurredAt },
    };
  }
  if (status === 404) {
    return {
      status: 404,
      body: { code: 'unknown_record', message: 'No handler for that path', requestId, occurredAt },
    };
  }
  if (status === 405) {
    return {
      status: 405,
      body: { code: 'method_not_allowed', message: 'That method is not allowed here', requestId, occurredAt },
    };
  }

  return {
    status: 500,
    body: { code: 'internal_error', message: 'Unexpected server error', requestId, occurredAt },
  };
}

/** Behind a proxy the socket address is the proxy, so trust the first forwarded hop. */
export function callerAddress(request: FastifyRequest): string | undefined {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(',')[0]?.trim() ?? request.ip;
}

export function headerValue(reply: FastifyReply, name: string, value: string): void {
  reply.header(name, value);
}
