import { liveFields, type ContentTypeDef, type Entry, type EntryData, type FieldDef } from '@velocity-astro/cms-core';
import { Button, Card, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { useContentTypes, useEntriesOfTypes, usePublishEntry, useUpdateEntry } from '../../client/queries.js';
import { FieldGrid, useControlFor } from '../../fields/index.js';
import { localized, sameData, withValue } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** A page of the site's settings with looks to choose (its colours): the entry a page in this language reads, and those fields. */
export interface SiteLook {
  readonly type: ContentTypeDef;
  readonly entry: Entry;
  readonly fields: readonly FieldDef[];
}

/** What is being tried of the theme and not published: each settings entry's values, by its id. */
export type ThemeDraft = Readonly<Record<string, EntryData>>;

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

/**
 * The looks the whole site has: every field of a page kept in the settings whose control says
 * it is a choice among the site's colours. For a page in `locale`, the settings entry in that
 * language where there is one, as the site itself reads it.
 */
export function useSiteLooks(locale: string | undefined): readonly SiteLook[] {
  const controlFor = useControlFor();
  const types = (useContentTypes().data ?? []).filter((type) => type.kind === 'single' && type.inSettings === true);
  const lists = useEntriesOfTypes(types.map((type) => ({ type: type.key, limit: 200 })));
  return types.flatMap((type, at) => {
    const entries = [...(lists[at]?.data?.items ?? [])].sort((a, b) => a.locale.localeCompare(b.locale));
    const entry = entries.find((candidate) => candidate.locale === locale) ?? entries[0];
    if (!entry) return [];
    // A choice among the template's named looks (swatches), or a colour or font a person sets.
    const fields = liveFields(type.fields).filter((field) => {
      const control = controlFor(field.type);
      return control?.isLook === true || (control?.swatches?.(field, entry.data[field.id], controlFor) ?? []).length > 0;
    });
    return fields.length > 0 ? [{ type, entry, fields }] : [];
  });
}

/** What of a theme being tried differs from what is saved, as the entries a page is drawn with. */
export function themeTried(looks: readonly SiteLook[], draft: ThemeDraft): readonly { readonly id: string; readonly data: EntryData }[] {
  return looks.flatMap(({ entry }) => {
    const data = draft[entry.id];
    return data !== undefined && !sameData(data, entry.data) ? [{ id: entry.id, data }] : [];
  });
}

export interface ThemeCardProps {
  readonly looks: readonly SiteLook[];
  readonly draft: ThemeDraft;
  readonly onChange: (draft: ThemeDraft) => void;
}

/**
 * The site's theme beside a page: its colours are tried on the page as they are chosen, and
 * nothing is kept until they are published. They are fields of the settings, saved and published
 * as the settings' own screen does it.
 */
export function ThemeCard({ looks, draft, onChange }: ThemeCardProps) {
  const messages = useMessages();
  const locale = useLocale();
  const update = useUpdateEntry();
  const publish = usePublishEntry();
  const [isPublishing, setPublishing] = useState(false);
  const tried = themeTried(looks, draft);

  async function publishAll() {
    setPublishing(true);
    try {
      for (const { id, data } of tried) {
        const look = looks.find((candidate) => candidate.entry.id === id);
        if (!look) continue;
        const saved = await update.mutateAsync({ id, changes: { slug: look.entry.slug, data, expectedRevision: look.entry.revision } });
        await publish.mutateAsync({ id, expectedRevision: saved.revision });
      }
      onChange({});
      toast({ title: messages.editor.themePublished, description: messages.editor.themePublishedDescription, tone: 'success' });
    } catch (error) {
      toast({ title: messages.editor.themeNotPublished, description: error instanceof Error ? error.message : String(error), tone: 'danger' });
    }
    setPublishing(false);
  }

  return (
    <Card
      title={messages.editor.themeTitle}
      description={messages.editor.themeHelp(looks.map((look) => localized(look.type.label, locale)).join(', '))}
      footer={
        <>
          <Button isDisabled={tried.length === 0} isPending={isPublishing} onPress={() => void publishAll()}>
            {messages.editor.themePublish}
          </Button>
          <Button variant="ghost" isDisabled={tried.length === 0 || isPublishing} onPress={() => onChange({})}>
            {messages.editor.themeDiscard}
          </Button>
        </>
      }
    >
      {looks.map(({ type, entry, fields }) => (
        <FieldGrid
          key={entry.id}
          fields={fields}
          values={draft[entry.id] ?? entry.data}
          onChange={(field, value) => onChange({ ...draft, [entry.id]: withValue(draft[entry.id] ?? entry.data, field.id, value) })}
          pathOf={(field) => `${type.key}.${field.key}`}
          problems={NO_PROBLEMS}
          perRow={1}
        />
      ))}
    </Card>
  );
}
