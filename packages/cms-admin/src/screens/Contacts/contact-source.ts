import type { Contact, FormDef } from '@velocity/cms-core';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** Says where a contact first came from: the form and its page, or that someone added them. */
export function useSourceOf(forms: readonly FormDef[] | undefined): (contact: Contact) => string {
  const messages = useMessages();
  const locale = useLocale();
  return (contact) => {
    if (!contact.source) return messages.contacts.addedByHand;
    const form = forms?.find((candidate) => candidate.id === contact.source?.formId);
    // The forms are still on their way, or the form has gone to the trash.
    if (!form) return forms === undefined ? '' : messages.contacts.aFormNowGone;
    const name = localized(form.label, locale);
    return contact.source.page === undefined ? messages.contacts.fromForm(name) : messages.contacts.fromFormOn(name, contact.source.page);
  };
}
