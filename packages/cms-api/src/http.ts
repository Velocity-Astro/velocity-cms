import { CmsError, ValidationError, type ValidationIssue } from '@velocity-astro/cms-core';

/** The codes an error response can carry. A client reacts to the code and shows the message. */
export type ApiErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'too_large'
  | 'unsupported_media_type'
  | 'validation_failed'
  | 'internal';

/** What every error response looks like. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    /** Written for the person, and safe to show as it is. */
    readonly message: string;
    /** With `validation_failed`: each field that needs attention, by key. */
    readonly issues?: readonly ValidationIssue[];
  };
}

/** A request the API itself refuses, before or apart from any rule of the CMS. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The HTTP status for each refusal the CMS can raise. Anything else is a fault of ours: 500. */
const STATUS: Readonly<Record<string, { status: number; code: ApiErrorCode }>> = {
  validation_failed: { status: 422, code: 'validation_failed' },
  unknown_type: { status: 422, code: 'validation_failed' },
  conflict: { status: 409, code: 'conflict' },
  not_found: { status: 404, code: 'not_found' },
  forbidden: { status: 403, code: 'forbidden' },
  // A plugin broke while answering. The message is the host's, and says nothing of the inside.
  plugin_failed: { status: 502, code: 'internal' },
};

// Nothing the API says may be kept by a cache: it includes drafts, and it differs per person.
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function json(body: unknown, status = 200, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...headers } });
}

/**
 * The response for something thrown. A refusal keeps its own words. A fault says nothing about
 * what went wrong inside, because the message goes to whoever asked.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message } } satisfies ApiErrorBody, error.status, error.headers);
  }
  const known = error instanceof CmsError ? STATUS[error.code] : undefined;
  if (error instanceof CmsError && known) {
    const issues = error instanceof ValidationError ? { issues: error.issues } : {};
    return json({ error: { code: known.code, message: error.message, ...issues } } satisfies ApiErrorBody, known.status);
  }
  return json(
    { error: { code: 'internal', message: 'Something went wrong on the server. Try again in a moment.' } } satisfies ApiErrorBody,
    500,
  );
}

/** Whether a thrown value is a fault of ours, as opposed to a request we refused on purpose. */
export function isFault(error: unknown): boolean {
  return !(error instanceof ApiError) && !(error instanceof CmsError && error.code in STATUS);
}
