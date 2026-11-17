/** One problem with one field, as the server reports it. */
export interface RequestIssue {
  /** Where the problem is, as field keys and list positions: `['address', 'city']`. */
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type RequestErrorCode =
  | 'validation_failed'
  | 'conflict'
  | 'not_found'
  | 'forbidden'
  /** Nobody is signed in, or the session has ended. */
  | 'unauthenticated'
  | 'unknown';

/**
 * A request the server refused. The message is written for the person and can be shown as it
 * is; the code lets a screen react to what kind of refusal it was.
 */
export class AdminRequestError extends Error {
  constructor(
    message: string,
    readonly code: RequestErrorCode,
    /** Set when `code` is `validation_failed`: each field that needs attention. */
    readonly issues: readonly RequestIssue[] = [],
  ) {
    super(message);
    this.name = 'AdminRequestError';
  }
}
