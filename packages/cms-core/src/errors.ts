/** Every error the CMS raises on purpose extends this, with a stable `code` for API responses. */
export abstract class CmsError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface ValidationIssue {
  /** Where the problem is, as field keys and list positions: `['address', 'city']`. */
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export class ValidationError extends CmsError {
  readonly code = 'validation_failed';

  constructor(
    message: string,
    readonly issues: readonly ValidationIssue[],
  ) {
    super(message);
  }
}

export class ForbiddenError extends CmsError {
  readonly code = 'forbidden';
}

export class NotFoundError extends CmsError {
  readonly code = 'not_found';

  constructor(what: string, id: string) {
    super(`${what} "${id}" was not found.`);
  }
}

/** Something else changed first, or a name is already taken. */
export class ConflictError extends CmsError {
  readonly code = 'conflict';
}
