import type { Actor } from './access.js';
import type { ContentTypeDef, Entry, MediaFile } from './model.js';

/** Everything the CMS announces, and what each announcement carries. */
export interface CmsEvents {
  'type.saved': { type: ContentTypeDef; actor: Actor };
  /** The type's pages have left the site, or with `type.restored` are back on it. */
  'type.archived': { type: ContentTypeDef; actor: Actor };
  'type.restored': { type: ContentTypeDef; actor: Actor };
  'entry.saved': { entry: Entry; actor: Actor };
  /** `before` is the entry as it was, so a listener can tell what visitors saw until now. */
  'entry.published': { entry: Entry; before: Entry; actor: Actor };
  'entry.unpublished': { entry: Entry; before: Entry; actor: Actor };
  'media.uploaded': { file: MediaFile; actor: Actor };
  'media.removed': { file: MediaFile; actor: Actor };
}

type Listener<T> = (payload: T) => void | Promise<void>;

export class EventBus {
  readonly #listeners = new Map<keyof CmsEvents, Set<Listener<never>>>();

  /** Listens for an event. Returns a function that stops listening. */
  on<K extends keyof CmsEvents>(event: K, listener: Listener<CmsEvents[K]>): () => void {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener as Listener<never>);
    this.#listeners.set(event, listeners);
    return () => listeners.delete(listener as Listener<never>);
  }

  /** Runs every listener in the order it was added, and waits for each. */
  async emit<K extends keyof CmsEvents>(event: K, payload: CmsEvents[K]): Promise<void> {
    for (const listener of this.#listeners.get(event) ?? []) {
      await (listener as Listener<CmsEvents[K]>)(payload);
    }
  }
}
