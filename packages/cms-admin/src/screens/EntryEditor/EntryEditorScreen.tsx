import { EmptyState, Link } from '@velocity/cms-ui';
import { FileQuestion } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useGo } from '../../app/use-go.js';
import { NEW_ENTRY, paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { AdminRequestError } from '../../client/errors.js';
import { useContentTypes, useEntries, useEntry, useFieldTypes } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { EntryForm } from './EntryForm.js';

/** One entry, open for editing: a new one, or one that exists. */
export function EntryEditorScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const { typeKey = '', entryId = NEW_ENTRY } = useParams();
  const isNew = entryId === NEW_ENTRY;
  const types = useContentTypes();
  const fieldTypes = useFieldTypes();
  const entry = useEntry(isNew ? null : entryId);
  // The same request the list makes, so it is usually answered already. Only used to find the
  // entry's other languages: if it fails, the entry can still be edited.
  const siblings = useEntries({ type: typeKey, limit: 200 });
  // The entry this screen created, if any. Its form carries on, instead of starting again.
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (types.isPending || fieldTypes.isPending) return <LoadingState shape="form" />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;
  if (fieldTypes.isError) return <ErrorState error={fieldTypes.error} onRetry={() => void fieldTypes.refetch()} />;

  const type = types.data.find((candidate) => candidate.key === typeKey);
  if (!type) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={messages.contentList.typeNotFoundTitle}
        description={messages.contentList.typeNotFoundDescription}
      />
    );
  }

  const notFound = (
    <EmptyState
      icon={FileQuestion}
      title={messages.editor.notFoundTitle}
      description={messages.editor.notFoundDescription}
      action={<Link href={paths.contentList(type.key)}>{messages.editor.back(localized(type.label, locale))}</Link>}
    />
  );

  if (!isNew) {
    if (entry.isPending) return <LoadingState shape="form" />;
    if (entry.isError) {
      const isMissing = entry.error instanceof AdminRequestError && entry.error.code === 'not_found';
      return isMissing ? notFound : <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />;
    }
    // An entry reached through another type's address is not at this address.
    if (entry.data.typeId !== type.id) return notFound;
  }

  return (
    <EntryForm
      key={entryId === createdId ? NEW_ENTRY : entryId}
      type={type}
      entry={isNew ? null : (entry.data ?? null)}
      versions={
        isNew || !entry.data
          ? []
          : (siblings.data?.items ?? [])
              .filter((other) => other.translationGroup === entry.data.translationGroup)
              // Always in the same order, whichever was saved last.
              .sort((a, b) => a.locale.localeCompare(b.locale))
      }
      onSwitch={(id) => go(paths.entry(type.key, id))}
      onCreated={(created) => {
        setCreatedId(created.id);
        go(paths.entry(type.key, created.id), { replace: true, viewTransition: false });
      }}
    />
  );
}
