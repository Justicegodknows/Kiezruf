import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/** Error body for every 4xx answer. `error` is a stable code; apps map it to their own translated text. */
export interface ApiError {
  error: string;
  [detail: string]: unknown;
}

export function sendError(reply: FastifyReply, status: number, error: string, details: Record<string, unknown> = {}) {
  return reply.code(status).send({ error, ...details } satisfies ApiError);
}

/** Parses `value` with `schema`, or answers 400 invalid_request and returns undefined. */
export function parseOr400<S extends z.ZodType>(schema: S, value: unknown, reply: FastifyReply): z.infer<S> | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  sendError(reply, 400, 'invalid_request', {
    fields: result.error.issues.map((issue) => issue.path.join('.') || '(body)'),
  });
  return undefined;
}
