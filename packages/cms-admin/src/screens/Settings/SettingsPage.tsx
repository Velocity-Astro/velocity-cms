import type { ContentTypeDef } from '@velocity-astro/cms-core';
import { Stack, Text } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useEntries, useEntry, useFieldTypes } from '../../client/queries.js';
import { fieldAt, localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { EntryForm } from '../EntryEditor/EntryForm.js';

const NEW = 'new';

/**
 * A single page a template keeps in the settings (what the business is called, its logo, how to
 * reach it), edited here as any page is: saved as a draft, then published to the site.
 */
export function SettingsPagePanel({ type }: { readonly type: ContentTypeDef }) {
  const messages = useMessages();
  const locale = useLocale();
  const fieldTypes = useFieldTypes();
  const entries = useEntries({ type: type.key, limit: 200 });
  // The language someone chose to edit, and the entry this screen made, whose form carries on.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Always in the same order, whichever was saved last.
  const versions = [...(entries.data?.items ?? [])].sort((a, b) => a.locale.localeCompare(b.locale));
  const listed = versions.find((entry) => entry.id === chosenId) ?? versions[0];
  const entryId = chosenId ?? listed?.id ?? null;
  const entry = useEntry(entryId);

  if (entries.isPending || fieldTypes.isPending || (entryId !== null && entry.isPending)) return <LoadingState shape="form" />;
  if (entries.isError) return <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />;
  if (fieldTypes.isError) return <ErrorState error={fieldTypes.error} onRetry={() => void fieldTypes.refetch()} />;
  // Only when there is nothing to show: an entry that could not be asked for again is still open, with what was typed.
  if (entryId !== null && entry.isError && entry.data === undefined) return <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />;

  // The field that names the site, by the name the form shows it under.
  const naming = type.siteNamePath && fieldAt(type, {}, type.siteNamePath)?.field;
  return (
    <Stack gap={2}>
      {naming && (
        <Text size="sm" tone="muted">
          {messages.settings.namesSite(localized(naming.label, locale))}
        </Text>
      )}
      <EntryForm
        embedded
        key={entryId === null || entryId === createdId ? NEW : entryId}
        type={type}
        entry={entryId === null ? null : (entry.data ?? null)}
        versions={versions}
        onSwitch={setChosenId}
        onCreated={(created) => {
          setCreatedId(created.id);
          setChosenId(created.id);
        }}
      />
    </Stack>
  );
}
