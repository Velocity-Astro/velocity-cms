import { CmsError, ConflictError } from './errors.js';

export class UnknownTypeError extends CmsError {
  readonly code = 'unknown_type';
}

/**
 * A set of things looked up by their `type` name.
 *
 * Field types live in one, and section types will too. Built-ins, a template's own and a plugin's
 * all register with the same call, so nothing built in has a private way in.
 */
export class Registry<T extends { readonly type: string }> {
  readonly #items = new Map<string, T>();

  /** @param noun What this registry holds, for error messages: "field type". */
  constructor(private readonly noun: string) {}

  register(item: T): this {
    if (this.#items.has(item.type)) {
      throw new ConflictError(`A ${this.noun} named "${item.type}" is already registered.`);
    }
    this.#items.set(item.type, item);
    return this;
  }

  has(type: string): boolean {
    return this.#items.has(type);
  }

  get(type: string): T {
    const item = this.#items.get(type);
    if (!item) {
      const known = [...this.#items.keys()].sort().join(', ');
      throw new UnknownTypeError(`There is no ${this.noun} named "${type}". Registered: ${known}.`);
    }
    return item;
  }

  list(): T[] {
    return [...this.#items.values()];
  }
}
