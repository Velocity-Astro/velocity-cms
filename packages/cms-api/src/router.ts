export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface Route<THandler> {
  readonly method: Method;
  readonly segments: readonly string[];
  readonly handler: THandler;
}

export type Match<THandler> =
  | { readonly kind: 'found'; readonly handler: THandler; readonly params: Readonly<Record<string, string>> }
  /** The address exists, but not for this method. `allowed` lists the ones it does take. */
  | { readonly kind: 'wrong-method'; readonly allowed: readonly Method[] }
  | { readonly kind: 'none' };

const split = (path: string) => path.split('/').filter((segment) => segment !== '');

/**
 * Finds the handler for a method and a path. Patterns are plain segments, with `:name` standing
 * for one segment of any text: `/entries/:id/publish`.
 */
export class Router<THandler> {
  readonly #routes: Route<THandler>[] = [];

  add(method: Method, pattern: string, handler: THandler): this {
    this.#routes.push({ method, segments: split(pattern), handler });
    return this;
  }

  match(method: string, path: string): Match<THandler> {
    const segments = split(path);
    const allowed: Method[] = [];
    for (const route of this.#routes) {
      const params = capture(route.segments, segments);
      if (!params) continue;
      if (route.method === method) return { kind: 'found', handler: route.handler, params };
      allowed.push(route.method);
    }
    return allowed.length > 0 ? { kind: 'wrong-method', allowed } : { kind: 'none' };
  }
}

function capture(pattern: readonly string[], segments: readonly string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, expected] of pattern.entries()) {
    const actual = segments[index] ?? '';
    if (expected.startsWith(':')) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}
