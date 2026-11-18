import type { Actor } from './access.js';
import type { ValidationIssue } from './errors.js';
import type { ContentTypeDef, PublicEntry } from './model.js';

/** What a check is shown: the entry as it would go out, with values by field key. */
export interface PublishCheckInput {
  readonly entry: PublicEntry;
  readonly type: ContentTypeDef;
  readonly actor: Actor;
}

/**
 * A rule an entry must pass before it is published, beyond what its fields require: a
 * description for search engines, a photo with a caption. It answers with what is wrong, naming
 * fields by key, or with nothing.
 */
export type PublishCheck = (input: PublishCheckInput) => readonly ValidationIssue[] | Promise<readonly ValidationIssue[]>;

/** The checks a publish runs, in the order they were added, after the fields' own validation. */
export class PublishChecks {
  readonly #checks = new Set<PublishCheck>();

  /** Adds a check. Returns a function that takes it away again. */
  add(check: PublishCheck): () => void {
    this.#checks.add(check);
    return () => this.#checks.delete(check);
  }

  /** Everything every check found. Empty means the entry may go out. */
  async run(input: PublishCheckInput): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    for (const check of this.#checks) issues.push(...(await check(input)));
    return issues;
  }
}
