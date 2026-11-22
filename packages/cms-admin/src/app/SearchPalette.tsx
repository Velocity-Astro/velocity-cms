import { CommandPalette, type CommandGroup, type CommandItem } from '@velocity-astro/cms-ui';
import type { ContentTypeDef } from '@velocity-astro/cms-core';
import { Contact } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useFoundContacts, useFoundEntries } from '../client/queries.js';
import { entryTitle, localized } from '../lib/content.js';
import { typeIcon } from '../lib/type-icon.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { paths } from './paths.js';

export interface SearchPaletteProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Everything the menu leads to. */
  readonly places: readonly CommandItem[];
  /** Everything that can be made from anywhere. */
  readonly creations: readonly CommandItem[];
  /** The site's content types, so an entry found is named and opened by its type. */
  readonly types: readonly ContentTypeDef[];
  /** Whether whoever is signed in may read contacts, so they are searched too. */
  readonly findsContacts: boolean;
  /** Goes to an address of the editor. */
  readonly onGo: (path: string) => void;
  /** Starts a new entry of the type with this key. */
  readonly onCreate: (typeKey: string) => void;
}

/** Fewer letters than this find too much to be worth asking the server about. */
const SEARCH_FROM = 2;

/**
 * The editor's one search: the places of the menu and what can be made, narrowed as the person
 * types, and with them the entries and contacts the server finds by what they hold (a title, an
 * address, a name, an email, a phone).
 */
export function SearchPalette({ isOpen, onOpenChange, places, creations, types, findsContacts, onGo, onCreate }: SearchPaletteProps) {
  const messages = useMessages();
  const locale = useLocale();
  const [typed, setTyped] = useState('');
  const words = useDeferredValue(typed.trim());
  const isSearching = isOpen && words.length >= SEARCH_FROM;
  const entries = useFoundEntries(words, isSearching);
  const contacts = useFoundContacts(words, isSearching && findsContacts);

  // An entry in several languages is found once: the version saved last.
  const typeById = new Map(types.map((type) => [type.id, type]));
  const seen = new Set<string>();
  const foundEntries: CommandItem[] = [];
  for (const entry of isSearching ? (entries.data?.items ?? []) : []) {
    const type = typeById.get(entry.typeId);
    if (type === undefined || seen.has(entry.translationGroup)) continue;
    seen.add(entry.translationGroup);
    const href = type.inSettings === true ? paths.settingsPage(type.key) : paths.entry(type.key, entry.id);
    foundEntries.push({
      id: `found:${href}`,
      label: entryTitle(type, entry.data) ?? messages.app.searchUntitled,
      detail: localized(type.label, locale),
      icon: typeIcon(type.key),
    });
  }
  const foundContacts: CommandItem[] = (isSearching && findsContacts ? (contacts.data?.items ?? []) : []).map((contact) => ({
    id: `found:${paths.contact(contact.id)}`,
    label: contact.name ?? contact.email,
    ...(contact.name !== undefined && { detail: contact.email }),
    icon: Contact,
  }));
  const groups: CommandGroup[] = [
    { id: 'go', label: messages.app.goToGroup, items: places },
    { id: 'entries', label: messages.app.searchContentGroup, items: foundEntries, isFound: true },
    { id: 'contacts', label: messages.app.searchContactsGroup, items: foundContacts, isFound: true },
    { id: 'create', label: messages.app.createGroup, items: creations },
  ];
  const isWaiting = isSearching && (entries.isFetching || (findsContacts && contacts.isFetching));

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={(open) => {
        // The next search starts empty, as the box does.
        if (!open) setTyped('');
        onOpenChange(open);
      }}
      label={messages.app.searchTitle}
      placeholder={messages.app.searchPlaceholder}
      emptyText={isWaiting ? messages.app.searching : messages.app.searchEmpty}
      groups={groups}
      onSearch={setTyped}
      onAction={(id) => {
        setTyped('');
        if (id.startsWith('go:')) onGo(id.slice('go:'.length));
        else if (id.startsWith('found:')) onGo(id.slice('found:'.length));
        else if (id.startsWith('new:')) onCreate(id.slice('new:'.length));
      }}
    />
  );
}
