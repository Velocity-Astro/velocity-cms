import { liveFields, type ContentTypeDef, type Entry, type FieldDef } from '@velocity-astro/cms-core';
import { Button, Card, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { useContentTypes, useEntriesOfTypes, usePublishEntry, useUpdateEntry } from '../../client/queries.js';
import { FieldGrid } from '../../fields/index.js';
import { entryState, localized, sameData, withValue } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import type { ThemeDraft } from './ThemeCard.js';

/** A part every page shows (a header, an announcement bar), pressed on the page: the single page it comes from and the field pressed, as keys. */
export interface PressedPart {
  readonly key: string;
  readonly field?: string | undefined;
  /** When it was pressed, so pressing the same field again points at it again. */
  readonly at: number;
}

/** The single page a part of the site comes from, and its entry in the language of the page being edited. */
export interface SitePart {
  readonly type: ContentTypeDef;
  readonly entry: Entry;
}

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

/**
 * The single page a part every page shows comes from: its entry in `locale` where there is one,
 * as the site reads it, or its first. `null` while it loads, and for a key that is no single page.
 */
export function useSitePart(key: string | null, locale: string | undefined): SitePart | null {
  const type = (useContentTypes().data ?? []).find((candidate) => candidate.kind === 'single' && candidate.key === key);
  const [list] = useEntriesOfTypes(type ? [{ type: type.key, limit: 200 }] : []);
  if (!type) return null;
  const entries = [...(list?.data?.items ?? [])].sort((a, b) => a.locale.localeCompare(b.locale));
  const entry = entries.find((candidate) => candidate.locale === locale) ?? entries[0];
  return entry ? { type, entry } : null;
}

/** The fields shown for a part: those of the section that holds the field pressed, or every field where the page has no sections. */
export function partFields(type: ContentTypeDef, field: string | undefined): { readonly fields: readonly FieldDef[]; readonly section?: string } {
  const live = liveFields(type.fields);
  const top = field?.split('.')[0];
  const pressed = live.find((candidate) => candidate.key === top);
  const section = pressed ? type.sections?.find((candidate) => candidate.fieldIds.includes(pressed.id)) : type.sections?.[0];
  if (!section) return { fields: live };
  const fields = section.fieldIds.flatMap((id) => live.filter((candidate) => candidate.id === id));
  return fields.length > 0 ? { fields, section: section.key } : { fields: live };
}

export interface SitePartCardProps {
  readonly part: SitePart;
  readonly pressed: PressedPart;
  /** What is typed and not published, by entry id: shared with the theme, since both are the site's own pages. */
  readonly draft: ThemeDraft;
  readonly onChange: (draft: ThemeDraft) => void;
  readonly onClose: () => void;
}

/**
 * A part every page shows, beside the page that was pressed: the fields of its single page, tried
 * on the page as they are typed. Nothing is kept until they are published, which saves and
 * publishes that page as its own screen does, with its revision.
 */
export function SitePartCard({ part, pressed, draft, onChange, onClose }: SitePartCardProps) {
  const messages = useMessages();
  const locale = useLocale();
  const update = useUpdateEntry();
  const publish = usePublishEntry();
  const [isPublishing, setPublishing] = useState(false);
  const { type, entry } = part;
  const values = draft[entry.id] ?? entry.data;
  const isTyped = draft[entry.id] !== undefined && !sameData(values, entry.data);
  // Saved and not yet out: the page beside the form shows it, so it is published from here too.
  const isWaiting = entryState(entry) === 'unpublishedChanges' || entry.status !== 'published';
  const { fields, section } = partFields(type, pressed.field);
  const sectionLabel = type.sections?.find((candidate) => candidate.key === section)?.label;
  const name = localized(type.label, locale);

  async function publishPart() {
    setPublishing(true);
    try {
      const saved = isTyped ? await update.mutateAsync({ id: entry.id, changes: { slug: entry.slug, data: values, expectedRevision: entry.revision } }) : entry;
      await publish.mutateAsync({ id: entry.id, expectedRevision: saved.revision });
      const { [entry.id]: _published, ...rest } = draft;
      onChange(rest);
      toast({ title: messages.editor.partPublished(name), description: messages.editor.partPublishedDescription, tone: 'success' });
    } catch (error) {
      toast({ title: messages.editor.partNotPublished(name), description: error instanceof Error ? error.message : String(error), tone: 'danger' });
    }
    setPublishing(false);
  }

  function discard() {
    const { [entry.id]: _dropped, ...rest } = draft;
    onChange(rest);
  }

  return (
    <Card
      title={sectionLabel ? `${name} · ${localized(sectionLabel, locale)}` : name}
      description={messages.editor.partHelp}
      footer={
        <>
          <Button isDisabled={!isTyped && !isWaiting} isPending={isPublishing} onPress={() => void publishPart()}>
            {messages.editor.partPublish}
          </Button>
          <Button variant="ghost" isDisabled={!isTyped || isPublishing} onPress={discard}>
            {messages.editor.themeDiscard}
          </Button>
          <Button variant="ghost" isDisabled={isPublishing} onPress={onClose}>
            {messages.editor.partClose}
          </Button>
        </>
      }
    >
      <FieldGrid
        fields={fields}
        values={values}
        onChange={(field, value) => onChange({ ...draft, [entry.id]: withValue(values, field.id, value) })}
        pathOf={(field) => `${type.key}.${field.key}`}
        problems={NO_PROBLEMS}
        perRow={1}
        spotlight={{ key: pressed.field?.split('.')[0], at: pressed.at }}
      />
    </Card>
  );
}
