import type { ContentTypeDef, Entry, EntryData, FieldDef } from '@velocity/cms-core';
import { SLUG_PATH, isSlug, liveFields } from '@velocity/cms-core';
import { Box, Button, Card, ConfirmDialog, Form, SaveBar, Segmented, Split, Stack, Tag, Text, TextField, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateEntry, usePublishEntry, useUnpublishEntry, useUpdateEntry } from '../../client/queries.js';
import { FieldGrid } from '../../fields/index.js';
import { entryState, entryTitle, languageName, localized, sameData, withValue, type EntryState } from '../../lib/content.js';
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
  /** The entry in every language it exists in, this one included. Fewer than two shows no switch. */
  readonly versions?: readonly Entry[];
  /** Called with the id of the version the person chose to open instead. */
  readonly onSwitch?: (entryId: string) => void;
}

/**
 * The fields of one entry, and the bar that saves and publishes it.
 *
 * It holds what the person has typed. The server holds what is saved, and what is published.
 * Saving sends the first to the second; publishing is a separate step the person chooses.
 */
export function EntryForm({ type, entry, onCreated, versions = [], onSwitch }: EntryFormProps) {
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

  const changeField = (field: FieldDef, value: unknown) => {
    setData((current) => withValue(current, field.id, value));
    // A problem is about what was sent. Once the field changes, it no longer applies.
    setProblems((current) => new Map([...current].filter(([path]) => path !== field.key && !path.startsWith(`${field.key}.`))));
  };

  // The type's own sections, then one for any field it left out of them. A type with no
  // sections is one card.
  const live = liveFields(type.fields);
  const placed = new Set((type.sections ?? []).flatMap((section) => section.fieldIds));
  const rest = live.filter((field) => !placed.has(field.id));
  const sections: { key: string; title?: string; aside: boolean; fields: FieldDef[] }[] = [
    ...(type.sections ?? []).map((section) => ({
      key: section.key,
      title: localized(section.label, locale),
      aside: section.aside === true,
      fields: section.fieldIds.flatMap((id) => live.filter((field) => field.id === id)),
    })),
    ...(rest.length > 0 ? [{ key: '$rest', ...(type.sections?.length && { title: messages.editor.otherFields }), aside: false, fields: rest }] : []),
  ];
  const savedNote =
    entry === null ? messages.editor.notSavedYet : hasChanges ? messages.editor.unsavedChanges : messages.editor.saved(relativeTime(entry.updatedAt, locale));

  const card = (section: (typeof sections)[number]) => (
    <Card key={section.key} {...(section.title !== undefined && { title: section.title })}>
      {/* Beside the content there is room for one field per row. */}
      <FieldGrid fields={section.fields} values={data} onChange={changeField} pathOf={(field) => field.key} problems={problems} {...(section.aside && { perRow: 1 as const })} />
    </Card>
  );

  return (
    <Stack gap={0} fill>
      <SaveBar
        label={messages.editor.saveBar}
        back={{ href: paths.contentList(type.key), label: typeName }}
        title={title ?? (entry ? messages.contentList.untitled : messages.editor.newTitle)}
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
            {entry !== null && versions.length > 1 && (
              <Segmented
                label={messages.editor.language}
                selected={entry.id}
                onChange={(id) => onSwitch?.(id)}
                // Leaving would drop what was typed, so the other languages wait for a save.
                options={versions.map((version) => ({
                  id: version.id,
                  label: languageName(version.locale, locale),
                  isDisabled: version.id !== entry.id && (hasChanges || isBusy),
                }))}
              />
            )}
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
      <Box paddingX={12} paddingY={8} grow>
        <Form label={messages.editor.form} gap={5} onSubmit={() => void run('save')}>
          <Split
            asideLabel={messages.editor.aside}
            aside={
              <>
                <Card title={type.urlPattern !== undefined ? messages.editor.addressSection : messages.editor.identifierSection}>
                  <TextField
                    label={messages.editor.slug}
                    value={slug}
                    onChange={(next) => {
                      setTypedSlug(next);
                      setSlugProblem(null);
                    }}
                    isRequired
                    description={
                      type.urlPattern !== undefined
                        ? messages.editor.slugDescription(type.urlPattern.replace('[slug]', slug === '' ? '…' : slug))
                        : messages.editor.slugAsIdentifier
                    }
                    {...(slugProblem !== null && { errorMessage: slugProblem })}
                  />
                </Card>
                {sections.filter((section) => section.aside).map(card)}
              </>
            }
          >
            {sections.filter((section) => !section.aside).map(card)}
          </Split>
        </Form>
      </Box>
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
