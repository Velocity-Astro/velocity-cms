import type { Actor } from './access.js';
import type { Permission } from './access.js';
import type { Contact, CustomFields, Deal, ContentTypeDef, Entry, FormDef, MediaFile, Pipeline, SettingsArea, Submission } from './model.js';

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
  /** The entry went to the trash. One that was on the site is announced as unpublished first. */
  'entry.trashed': { entry: Entry; before: Entry; actor: Actor };
  /** The entry came back from the trash, as a draft. */
  'entry.restored': { entry: Entry; actor: Actor };
  /** The entry and its history are gone for good. `entry` is what it was. */
  'entry.deleted': { entry: Entry; actor: Actor };
  'form.saved': { form: FormDef; actor: Actor };
  /** The form went to the trash, came back from it, or is gone for good with its submissions. */
  'form.trashed': { form: FormDef; actor: Actor };
  'form.restored': { form: FormDef; actor: Actor };
  'form.deleted': { form: FormDef; actor: Actor };
  /** A visitor sent a form. Nobody is acting: the sender is not a user of the CMS. */
  'submission.received': { submission: Submission; form: FormDef };
  /** A submission was marked new, handled or spam. */
  'submission.changed': { submission: Submission; actor: Actor };
  /** Submissions are gone for good: deleted, erased for a person, or past the time they are kept. */
  'submission.deleted': { formId: string; ids: readonly string[]; actor: Actor };
  /** A contact was made or changed. Nobody is acting when a submission made it. */
  /** `imported` says the contact came in with many others from a file, so it is not news one at a time. */
  'contact.saved': { contact: Contact; actor?: Actor; imported?: true };
  /** A contact is gone for good, with its notes. `contact` is what it was. */
  'contact.deleted': { contact: Contact; actor: Actor };
  /** A deal was made or changed, or is gone for good. */
  'deal.saved': { deal: Deal; actor?: Actor };
  'deal.deleted': { deal: Deal; actor: Actor };
  /** The stages contacts move through were changed. */
  'pipeline.saved': { pipeline: Pipeline; actor: Actor };
  /** The fields a site adds to its contacts and deals were changed. */
  'custom-fields.saved': { fields: CustomFields; actor: Actor };
  /** One part of the site's settings was saved, such as how its email is sent. It carries no key. */
  'settings.saved': { area: SettingsArea; actor: Actor };
  'media.uploaded': { file: MediaFile; actor: Actor };
  'media.removed': { file: MediaFile; actor: Actor };
  /** A plugin was switched on or off, or its settings were saved. */
  'plugin.changed': { plugin: string; actor: Actor };
  /** A plugin says the site's pages would now come out differently, so kept copies are stale. */
  'pages.changed': { plugin: string };
}

/**
 * What a listener must be allowed before it is told of an event. Submissions and contacts are
 * personal data, so a plugin hears of them only if it declared that it reads them.
 */
export const EVENT_NEEDS: Readonly<Partial<Record<keyof CmsEvents, Permission>>> = {
  'submission.received': 'submission:read',
  'submission.changed': 'submission:read',
  'contact.saved': 'contact:read',
  'contact.deleted': 'contact:read',
  'deal.saved': 'contact:read',
  'deal.deleted': 'contact:read',
};

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
