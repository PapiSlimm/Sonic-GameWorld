// Typed application errors + the Fastify error handler that turns them (and everything else)
// into the contract's response envelope: `{ error: { code, message, details? } }` (§9).
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Base class for all intentionally-thrown application errors. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ErrorBody {
    const body: ErrorBody['error'] = { code: this.code, message: this.message };
    if (this.details !== undefined) body.details = this.details;
    return { error: body };
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }
  /** `AppError.notFound('User')` → "User not found"; `AppError.notFound('User', id)` → "User '<id>' not found". */
  static notFound(resource = 'Resource', id?: string): AppError {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`;
    return new AppError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }
  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(429, 'RATE_LIMITED', message);
  }
  static quotaExceeded(message: string, details?: unknown): AppError {
    return new AppError(402, 'QUOTA_EXCEEDED', message, details);
  }
  static internal(message = 'Internal server error', details?: unknown): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Validation failed') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

function zodDetails(err: ZodError): unknown {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code }));
}

/** Fastify `setErrorHandler` implementation — registered once in src/app.ts. */
export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
    else request.log.warn({ err: error }, error.message);
    reply.status(error.statusCode).send(error.toBody());
    return;
  }

  if (error instanceof ZodError) {
    request.log.warn({ err: error }, 'validation error');
    reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: zodDetails(error) } });
    return;
  }

  const fastifyErr = error as FastifyError;
  if (fastifyErr.validation) {
    request.log.warn({ err: error }, 'request validation error');
    reply.status(fastifyErr.statusCode ?? 400).send({
      error: { code: 'VALIDATION_ERROR', message: fastifyErr.message, details: fastifyErr.validation },
    });
    return;
  }

  if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
    request.log.warn({ err: error }, error.message);
    reply.status(fastifyErr.statusCode).send({
      error: { code: fastifyErr.code ?? 'BAD_REQUEST', message: error.message },
    });
    return;
  }

  request.log.error({ err: error }, 'unhandled error');
  reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}

/** Fastify `setNotFoundHandler` implementation for unmatched routes. */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
}
