import type { ContentTypeDef, Entry, EntryData, FieldDef } from '@velocity/cms-core';
import { HOME_SLUG, SLUG_PATH, isSlug, isSlugPath, liveFields, takesSlugPath } from '@velocity/cms-core';
import { Box, Button, Card, ConfirmDialog, Form, IconButton, Menu, SaveBar, Segmented, Split, Stack, Tag, Text, TextField, Workbench, toast } from '@velocity/cms-ui';
import { CalendarClock, Copy, Ellipsis, EyeOff, History, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateEntry, useDuplicateEntry, useSession, usePreviewEntry, usePublishEntry, useTrashEntry, useUnpublishEntry, useUpdateEntry } from '../../client/queries.js';
import { HistoryDialog } from './HistoryDialog.js';
import { ScheduleDialog, scheduledFor } from './ScheduleDialog.js';
import { FieldGrid, PageFocusProvider, useControlFor } from '../../fields/index.js';
import { entryState, entryTitle, languageName, localized, sameData, withValue, type EntryState } from '../../lib/content.js';
import { openPreviewTab } from '../../lib/preview-tab.js';
import { relativeTime } from '../../lib/relative-time.js';
import { slugify } from '../../lib/slug.js';
import { useLeaveGuard } from '../../lib/use-leave-guard.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { PluginBoundary } from '../../plugins/PluginBoundary.js';
import { usePluginExtensions } from '../../plugins/plugin-editor.js';
import { EntryDeals } from './EntryDeals.js';
import { PagePane } from './PagePane.js';

const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

type Action = 'save' | 'publish' | 'unpublish' | 'preview' | 'trash' | 'duplicate';

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
  /** Called once the entry has gone to the trash, so the screen can move on. */
  readonly onTrashed?: () => void;
}

/**
 * The fields of one entry, and the bar that saves and publishes it.
 *
 * It holds what the person has typed. The server holds what is saved, and what is published.
 * Saving sends the first to the second; publishing is a separate step the person chooses.
 */
export function EntryForm({ type, entry, onCreated, versions = [], onSwitch, onTrashed }: EntryFormProps) {
  const messages = useMessages();
  const locale = useLocale();
  const create = useCreateEntry();
  const update = useUpdateEntry();
  const publish = usePublishEntry();
  const unpublish = useUnpublishEntry();
  const trash = useTrashEntry();
  const duplicate = useDuplicateEntry();
  const previewLink = usePreviewEntry();
  const session = useSession();

  const [data, setData] = useState<EntryData>(entry?.data ?? {});
  // The slug as typed. Until someone types one, a new entry's slug follows its title.
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const [slugProblem, setSlugProblem] = useState<string | null>(null);
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const [running, setRunning] = useState<Action | null>(null);
  const [isConfirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [isConfirmingTrash, setConfirmingTrash] = useState(false);
  const [isShowingHistory, setShowingHistory] = useState(false);
  const [isScheduling, setScheduling] = useState(false);

  const typeName = localized(type.label, locale);
  const title = entryTitle(type, data);
  // A single page is its type's one entry, so it is named after the type and nobody has to name it.
  const isSingle = type.kind === 'single';
  const slug = typedSlug ?? entry?.slug ?? (isSingle ? type.key : slugify(title ?? ''));
  // A type whose address pattern says [...slug] has pages under other pages: services/roofing.
  const isDeep = takesSlugPath(type);
  const slugFits = isDeep ? isSlugPath(slug) : isSlug(slug);
  const hasChanges = entry === null || slug !== entry.slug || !sameData(data, entry.data);
  const state = entry ? entryState(entry) : 'draft';
  // What would be lost by leaving now. A new entry nobody has typed in holds nothing, and a save
  // under way moves on by itself.
  const hasTyped = entry === null ? typedSlug !== null || Object.keys(data).length > 0 : hasChanges;
  const guard = useLeaveGuard(hasTyped && running === null);

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
    if (!slugFits) {
      setSlugProblem(slug === '' ? messages.editor.slugMissing : isDeep ? messages.editor.slugPathInvalid : messages.editor.slugInvalid);
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

  /** Saves what was typed, then shows the page as it would be in a new tab. */
  async function preview() {
    if (!slugFits) {
      setSlugProblem(slug === '' ? messages.editor.slugMissing : isDeep ? messages.editor.slugPathInvalid : messages.editor.slugInvalid);
      return;
    }
    // Opened now, while the browser still counts this as the person's own click.
    const tab = openPreviewTab();
    setRunning('preview');
    setProblems(NO_PROBLEMS);
    try {
      const current = await saved();
      setData(current.data);
      setTypedSlug(null);
      try {
        tab.show((await previewLink.mutateAsync(current.id)).path);
      } catch (error) {
        tab.close();
        report(messages.editor.notPreviewed, error);
      }
    } catch (error) {
      tab.close();
      report(messages.editor.notSaved, error);
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

  async function moveToTrash(id: string) {
    setRunning('trash');
    try {
      await trash.mutateAsync(id);
      toast({ title: messages.editor.trashed(title ?? messages.contentList.untitled), description: messages.editor.trashedDescription });
      // Still running, so the move away is not held up over what was typed.
      onTrashed?.();
    } catch (error) {
      report(messages.editor.notTrashed, error);
      setConfirmingTrash(false);
      setRunning(null);
    }
  }

  /** Copies what was last saved, and opens the copy. */
  async function makeCopy(id: string) {
    setRunning('duplicate');
    try {
      const copy = await duplicate.mutateAsync(id);
      toast({ title: messages.editor.duplicated(title ?? messages.contentList.untitled), description: messages.editor.duplicatedDescription, tone: 'success' });
      onSwitch?.(copy.id);
    } catch (error) {
      report(messages.editor.notDuplicated, error);
    }
    setRunning(null);
  }

  const isBusy = running !== null;
  // What fewer people come for sits behind one button, so the bar keeps to the main steps.
  const more = [
    ...(entry?.status === 'published' ? [{ id: 'unpublish', label: messages.editor.unpublish, icon: EyeOff }] : []),
    // A single page is its type's one entry: there is no second, and it is taken off the site, not thrown away.
    // Setting a time is a publishing decision, which an author cannot make.
    ...(entry !== null && session.data?.role !== 'author' ? [{ id: 'schedule', label: entry.publishAt !== undefined ? messages.editor.scheduleChange : messages.editor.schedule, icon: CalendarClock }] : []),
    ...(entry !== null ? [{ id: 'history', label: messages.editor.history, icon: History }] : []),
    ...(entry !== null && !isSingle ? [{ id: 'duplicate', label: messages.editor.duplicate, icon: Copy }] : []),
    ...(entry !== null && !isSingle ? [{ id: 'trash', label: messages.editor.trash, icon: Trash2, tone: 'danger' as const }] : []),
  ];
  // The slug is part of the page's address only when the type's pattern says so. Otherwise it
  // is a name other entries link by.
  const slugName = isDeep ? '[...slug]' : '[slug]';
  const slugPattern = type.urlPattern?.includes(slugName) ? type.urlPattern : undefined;
  const slugHelp = (pattern: string) => {
    // The page called index is the one at the top of the pattern: the home page.
    if (isDeep && slug === HOME_SLUG) return messages.editor.slugHomeDescription(pattern.replace(slugName, ''));
    return (isDeep ? messages.editor.slugPathDescription : messages.editor.slugDescription)(pattern.replace(slugName, slug === '' ? '…' : slug));
  };
  // A type whose entries only show on other pages has nothing of its own to preview.
  const hasPage = type.urlPattern !== undefined || Object.keys(type.localizedUrlPatterns ?? {}).length > 0;

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
  // An entry whose fields include the page itself, and which has a page, is edited beside it.
  const controlFor = useControlFor();
  const showsPage = hasPage && live.some((field) => controlFor(field.type)?.showsPage === true);
  // What plugins show beside this entry: a card each, which gets what is in the form now.
  const panels = usePluginExtensions()
    .panels.filter((panel) => panel.types === undefined || panel.types.includes(type.key))
    .map((panel) => (
      <Card key={`${panel.plugin}/${panel.id}`} title={panel.title}>
        <PluginBoundary>
          <panel.Component type={type} entry={entry} data={data} />
        </PluginBoundary>
      </Card>
    ));
  // Deals are as personal as contacts: the card is for those who may read them, on a saved entry.
  const showsDeals = type.forDeals === true && entry !== null && session.data !== null && session.data !== undefined && session.data.role !== 'author';
  // Right under the address, where it is seen without scrolling past the fields beside the content.
  const dealsCard = showsDeals ? <EntryDeals type={type} entry={entry} /> : null;
  const savedNote =
    entry === null
      ? messages.editor.notSavedYet
      : hasChanges
        ? messages.editor.unsavedChanges
        : entry.publishAt !== undefined
          ? messages.editor.goesOut(scheduledFor(entry.publishAt, locale))
          : messages.editor.saved(relativeTime(entry.updatedAt, locale));

  const card = (section: (typeof sections)[number]) => (
    <Card key={section.key} {...(section.title !== undefined && { title: section.title })}>
      {/* Beside the content there is room for one field per row. */}
      <FieldGrid fields={section.fields} values={data} onChange={changeField} pathOf={(field) => field.key} problems={problems} {...(section.aside && { perRow: 1 as const })} />
    </Card>
  );

  /** A card in the form's column beside the page, where there is room for one field per row. */
  const narrowCard = (section: (typeof sections)[number]) => card({ ...section, aside: true });

  return (
    <Stack gap={0} fill>
      <SaveBar
        label={messages.editor.saveBar}
        {...(!isSingle && { back: { href: paths.contentList(type.key), label: typeName } })}
        title={isSingle ? typeName : (title ?? (entry ? messages.contentList.untitled : messages.editor.newTitle))}
        status={
          <>
            <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>
            {entry?.publishProblem !== undefined && <Tag tone="danger">{messages.editor.missedSchedule}</Tag>}
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
                options={versions.map((version) => ({
                  id: version.id,
                  label: languageName(version.locale, locale),
                  isDisabled: version.id !== entry.id && isBusy,
                }))}
              />
            )}
            {more.length > 0 && (
              <Menu
                trigger={<IconButton label={messages.editor.more} icon={Ellipsis} isDisabled={isBusy} />}
                actions={more}
                onAction={(id) => (id === 'schedule' ? setScheduling(true) : id === 'history' ? setShowingHistory(true) : id === 'trash' ? setConfirmingTrash(true) : id === 'duplicate' && entry ? void makeCopy(entry.id) : setConfirmingUnpublish(true))}
              />
            )}
            {hasPage && (
              <Button variant="ghost" isDisabled={isBusy} isPending={running === 'preview'} onPress={() => void preview()}>
                {messages.editor.preview}
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
          {showsPage ? (
            // The page is beside the form, so everything else is in the form's one column.
            <PageFocusProvider>
              <Workbench paneLabel={messages.editor.pagePane} pane={<PagePane entry={entry} data={data} title={title ?? typeName} />}>
                {sections.filter((section) => !section.aside).map(narrowCard)}
                {!isSingle && (
                  <Card title={slugPattern !== undefined ? messages.editor.addressSection : messages.editor.identifierSection}>
                    <TextField
                      label={messages.editor.slug}
                      value={slug}
                      onChange={(next) => {
                        setTypedSlug(next);
                        setSlugProblem(null);
                      }}
                      isRequired
                      description={
                        slugPattern !== undefined
                          ? slugHelp(slugPattern)
                          : messages.editor.slugAsIdentifier
                      }
                      {...(slugProblem !== null && { errorMessage: slugProblem })}
                    />
                  </Card>
                )}
                {dealsCard}
                  {sections.filter((section) => section.aside).map(card)}
                {panels}
              </Workbench>
            </PageFocusProvider>
          ) : isSingle && panels.length === 0 && !showsDeals && !sections.some((section) => section.aside) ? (

            // Nothing to show beside the content, so the content has the page.
            <Stack gap={6}>{sections.map(card)}</Stack>
          ) : (
            <Split
              asideLabel={messages.editor.aside}
              aside={
                <>
                  {!isSingle && (
                    <Card title={slugPattern !== undefined ? messages.editor.addressSection : messages.editor.identifierSection}>
                      <TextField
                        label={messages.editor.slug}
                        value={slug}
                        onChange={(next) => {
                          setTypedSlug(next);
                          setSlugProblem(null);
                        }}
                        isRequired
                        description={
                          slugPattern !== undefined
                            ? slugHelp(slugPattern)
                            : messages.editor.slugAsIdentifier
                        }
                        {...(slugProblem !== null && { errorMessage: slugProblem })}
                      />
                    </Card>
                  )}
                  {dealsCard}
                  {sections.filter((section) => section.aside).map(card)}
                  {panels}
                </>
              }
            >
              {sections.filter((section) => !section.aside).map(card)}
            </Split>
          )}
        </Form>
      </Box>
      {isScheduling && entry !== null && <ScheduleDialog entry={entry} hasChanges={hasChanges} onClose={() => setScheduling(false)} />}
      {isShowingHistory && entry !== null && (
        <HistoryDialog
          type={type}
          entry={entry}
          hasChanges={hasChanges}
          onReverted={(reverted) => {
            // The form starts again from what was brought back.
            setData(reverted.data);
            setProblems(NO_PROBLEMS);
          }}
          onClose={() => setShowingHistory(false)}
        />
      )}
      <ConfirmDialog
        isOpen={guard.isAsking}
        onOpenChange={(isOpen) => {
          if (!isOpen) guard.stay();
        }}
        title={messages.editor.leaveTitle}
        confirmLabel={messages.editor.leave}
        cancelLabel={messages.editor.keepEditing}
        tone="danger"
        onConfirm={guard.leave}
      >
        {messages.editor.leaveDescription}
      </ConfirmDialog>
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
      {entry !== null && (
        <ConfirmDialog
          isOpen={isConfirmingTrash}
          onOpenChange={setConfirmingTrash}
          title={messages.editor.trashTitle}
          confirmLabel={messages.editor.trash}
          cancelLabel={messages.editor.cancel}
          tone="danger"
          isPending={running === 'trash'}
          onConfirm={() => void moveToTrash(entry.id)}
        >
          {entry.status === 'published' ? messages.editor.trashDescriptionPublished : messages.editor.trashDescription}
        </ConfirmDialog>
      )}
    </Stack>
  );
}
