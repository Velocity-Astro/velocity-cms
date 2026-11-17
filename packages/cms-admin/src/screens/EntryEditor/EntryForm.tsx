import type { ContentTypeDef, Entry, EntryData } from '@velocity/cms-core';
import { SLUG_PATH, isSlug, liveFields } from '@velocity/cms-core';
import { Box, Button, ConfirmDialog, Form, Link, PageHeader, SaveBar, Stack, Tag, Text, TextField, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateEntry, usePublishEntry, useUnpublishEntry, useUpdateEntry } from '../../client/queries.js';
import { FieldEditor } from '../../fields/index.js';
import { entryState, entryTitle, localized, sameData, withValue, type EntryState } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { slugify } from '../../lib/slug.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

type Action = 'save' | 'publish' | 'unpublish';

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

export interface EntryFormProps {
  readonly type: ContentTypeDef;
  /** The entry as the server has it, or `null` for one that has not been saved yet. */
  readonly entry: Entry | null;
  /** Called once, when a new entry is saved for the first time. */
  readonly onCreated: (entry: Entry) => void;
}

/**
 * The fields of one entry, and the bar that saves and publishes it.
 *
 * It holds what the person has typed. The server holds what is saved, and what is published.
 * Saving sends the first to the second; publishing is a separate step the person chooses.
 */
export function EntryForm({ type, entry, onCreated }: EntryFormProps) {
  const messages = useMessages();
  const locale = useLocale();
  const create = useCreateEntry();
  const update = useUpdateEntry();
  const publish = usePublishEntry();
  const unpublish = useUnpublishEntry();

  const [data, setData] = useState<EntryData>(entry?.data ?? {});
  // The slug as typed. Until someone types one, a new entry's slug follows its title.
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const [slugProblem, setSlugProblem] = useState<string | null>(null);
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const [running, setRunning] = useState<Action | null>(null);
  const [isConfirmingUnpublish, setConfirmingUnpublish] = useState(false);

  const typeName = localized(type.label, locale);
  const title = entryTitle(type, data);
  const slug = typedSlug ?? entry?.slug ?? slugify(title ?? '');
  const hasChanges = entry === null || slug !== entry.slug || !sameData(data, entry.data);
  const state = entry ? entryState(entry) : 'draft';

  /** Shows why the server refused: on the fields when it named them, and always in a message. */
  function report(what: string, error: unknown) {
    const issues = error instanceof AdminRequestError ? error.issues : [];
    const aboutSlug = issues.find((issue) => issue.path[0] === SLUG_PATH);
    if (aboutSlug) setSlugProblem(aboutSlug.message);
    setProblems(new Map(issues.map((issue) => [issue.path.join('.'), issue.message])));
    toast({
      title: what,
      description: issues.length > 0 ? messages.editor.fieldsNeedAttention(issues.length) : error instanceof Error ? error.message : String(error),
      tone: 'danger',
    });
  }

  /** Saves what has been typed, if anything has, and returns the entry as it now is. */
  async function saved(): Promise<Entry> {
    if (entry === null) {
      const created = await create.mutateAsync({ type: type.key, slug, data });
      onCreated(created);
      return created;
    }
    if (!hasChanges) return entry;
    return update.mutateAsync({ id: entry.id, changes: { slug, data, expectedRevision: entry.revision } });
  }

  async function run(action: 'save' | 'publish') {
    if (!isSlug(slug)) {
      setSlugProblem(slug === '' ? messages.editor.slugMissing : messages.editor.slugInvalid);
      return;
    }
    setRunning(action);
    setProblems(NO_PROBLEMS);
    let current: Entry;
    try {
      current = await saved();
      // The server's copy is now the starting point, so the form shows no changes.
      setData(current.data);
      setTypedSlug(null);
    } catch (error) {
      report(messages.editor.notSaved, error);
      setRunning(null);
      return;
    }
    if (action === 'save') {
      toast({ title: messages.editor.draftSaved, description: messages.editor.draftSavedDescription, tone: 'success' });
    } else {
      try {
        await publish.mutateAsync({ id: current.id, expectedRevision: current.revision });
        toast({ title: messages.editor.published, description: messages.editor.publishedDescription, tone: 'success' });
      } catch (error) {
        report(messages.editor.notPublished, error);
      }
    }
    setRunning(null);
  }

  async function takeOffSite(id: string) {
    setRunning('unpublish');
    try {
      await unpublish.mutateAsync(id);
      toast({ title: messages.editor.unpublished, description: messages.editor.unpublishedDescription });
    } catch (error) {
      report(messages.editor.notUnpublished, error);
    }
    setConfirmingUnpublish(false);
    setRunning(null);
  }

  const isBusy = running !== null;
  const savedNote =
    entry === null ? messages.editor.notSavedYet : hasChanges ? messages.editor.unsavedChanges : messages.editor.saved(relativeTime(entry.updatedAt, locale));

  return (
    <Stack gap={0} fill>
      <Box padding={8} grow>
        <Box maxWidth="md">
          <Stack gap={6}>
            <Stack gap={2}>
              <Link href={paths.contentList(type.key)} tone="muted">
                {messages.editor.back(typeName)}
              </Link>
              <PageHeader title={title ?? (entry ? messages.contentList.untitled : messages.editor.newTitle)} />
            </Stack>
            <Form label={messages.editor.form} gap={6} onSubmit={() => void run('save')}>
              {liveFields(type.fields).map((field) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  value={data[field.id]}
                  onChange={(value) => {
                    setData((current) => withValue(current, field.id, value));
                    // A problem is about what was sent. Once the field changes, it no longer applies.
                    setProblems((current) => new Map([...current].filter(([path]) => path !== field.key && !path.startsWith(`${field.key}.`))));
                  }}
                  path={field.key}
                  problems={problems}
                />
              ))}
              <TextField
                label={messages.editor.slug}
                value={slug}
                onChange={(next) => {
                  setTypedSlug(next);
                  setSlugProblem(null);
                }}
                isRequired
                {...(type.urlPattern !== undefined && {
                  description: messages.editor.slugDescription(type.urlPattern.replace('[slug]', slug === '' ? '…' : slug)),
                })}
                {...(slugProblem !== null && { errorMessage: slugProblem })}
              />
            </Form>
          </Stack>
        </Box>
      </Box>
      <SaveBar
        label={messages.editor.saveBar}
        status={
          <>
            <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>
            <Text as="span" size="sm" tone="muted">
              {savedNote}
            </Text>
          </>
        }
        actions={
          <>
            {entry?.status === 'published' && (
              <Button variant="ghost" isDisabled={isBusy} onPress={() => setConfirmingUnpublish(true)}>
                {messages.editor.unpublish}
              </Button>
            )}
            <Button variant="secondary" isDisabled={isBusy || !hasChanges} isPending={running === 'save'} onPress={() => void run('save')}>
              {messages.editor.saveDraft}
            </Button>
            <Button isDisabled={isBusy || (state === 'published' && !hasChanges)} isPending={running === 'publish'} onPress={() => void run('publish')}>
              {entry?.status === 'published' ? messages.editor.publishChanges : messages.editor.publish}
            </Button>
          </>
        }
      />
      {entry !== null && (
        <ConfirmDialog
          isOpen={isConfirmingUnpublish}
          onOpenChange={setConfirmingUnpublish}
          title={messages.editor.unpublishTitle}
          confirmLabel={messages.editor.unpublish}
          cancelLabel={messages.editor.cancel}
          tone="danger"
          isPending={running === 'unpublish'}
          onConfirm={() => void takeOffSite(entry.id)}
        >
          {messages.editor.unpublishDescription}
        </ConfirmDialog>
      )}
    </Stack>
  );
}
