import type { ContentTypeDef, Entry, EntryData, FieldDef, PresentOther } from '@velocity-astro/cms-core';
import { HOME_SLUG, SLUG_PATH, hasOwnPages, isSlug, isSlugPath, liveFields, takesSlugPath } from '@velocity-astro/cms-core';
import { Box, Button, Card, ConfirmDialog, Dialog, Fieldset, Form, Grid, IconButton, Menu, PageBody, SaveBar, Split, Stack, Tag, Text, TextField, Workbench, toast } from '@velocity-astro/cms-ui';
import { Bot, CalendarClock, Copy, Ellipsis, ExternalLink, Eye, EyeOff, GitCompareArrows, History, Languages, Palette, PanelRightClose, PanelRightOpen, Redo2, Save, Trash2, Undo2, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { paths } from '../../app/paths.js';
import { AdminRequestError } from '../../client/errors.js';
import { useCreateEntry, useDuplicateEntry, useEntryPresence, useSession, usePreviewEntry, usePublishEntry, useRefreshEntry, useTrashEntry, useUnpublishEntry, useUpdateEntry, useWroteEntry } from '../../client/queries.js';
import { HistoryDialog } from './HistoryDialog.js';
import { ScheduleDialog, scheduledFor } from './ScheduleDialog.js';
import { FieldGrid, PageFocusProvider, useControlFor } from '../../fields/index.js';
import { entryAddress, entryState, entryTitle, languageName, localized, sameData, withValue, type EntryState } from '../../lib/content.js';
import { mergeEntryData, type Prefer } from '../../lib/merge-entry.js';
import { openPreviewTab } from '../../lib/preview-tab.js';
import { differingWords } from '../../lib/value-words.js';
import { openSite } from '../../lib/open-site.js';
import { relativeTime } from '../../lib/relative-time.js';
import { slugify } from '../../lib/slug.js';
import { useHistory } from '../../lib/use-history.js';
import { useLeaveGuard } from '../../lib/use-leave-guard.js';
import { useSaveKey } from '../../lib/use-save-key.js';
import { NARROW, useNarrow } from '../../lib/use-narrow.js';
import { useUndoKeys } from '../../lib/use-undo-keys.js';
import { usePanelSizes } from '../../lib/use-panel-sizes.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { PluginBoundary } from '../../plugins/PluginBoundary.js';
import { usePluginExtensions } from '../../plugins/plugin-editor.js';
import { EntryDeals } from './EntryDeals.js';
import { PageCompany } from './PageCompany.js';
import { PagePane, PageWidths, type PageWidth } from './PagePane.js';
import { SectionOutline } from './SectionOutline.js';
import { SitePartCard, useSitePart, type PressedPart } from './SitePartCard.js';
import { ThemeCard, themeTried, useSiteLooks, type ThemeDraft } from './ThemeCard.js';

const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

type Action = 'save' | 'publish' | 'unpublish' | 'preview' | 'trash' | 'duplicate';

const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();
/** A save refused because the entry was saved by someone else since this form last had it. */
/** Thrown where a save met a newer version that changed what the form changed: the form says so itself, and asks. */
const CLASHED = Symbol('clashed');
const isConflict = (error: unknown) => error instanceof AdminRequestError && error.code === 'conflict';
/** How the address says the page has the whole window. */
const VIEW = 'view';
const VISUAL = 'visual';
/** How long after the last change the draft is saved by itself, in milliseconds. */
export const AUTOSAVE_PAUSE_MS = 2500;
/** The same while someone else has the entry open too: sooner, so each sees what the other typed as near as a save can bring it. */
export const AUTOSAVE_TOGETHER_MS = 1000;
/** How long the same news of someone else's saves (the same person, the same fields) is not said again, in milliseconds. */
const SAME_NEWS_MS = 20_000;
/** How long a newer version waits to be brought in for word of who saved it, in milliseconds. */
const NAME_WAIT_MS = 1500;
/** Where in an entry someone is, as presence says it: a field's id (`_` when it is not known), then a section's. */
const placeOf = (at: string | undefined) => {
  const [field, section] = at?.split('/') ?? [];
  return { field: field === undefined || field === '_' ? undefined : field, section };
};

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
  /** Set when the form is one part of a screen that has its own frame, such as a part of the settings. */
  readonly embedded?: boolean;
}

/**
 * The fields of one entry, and the bar that saves and publishes it.
 *
 * It holds what the person has typed. The server holds what is saved, and what is published.
 * Saving sends the first to the second; publishing is a separate step the person chooses.
 */
export function EntryForm({ type, entry, onCreated, versions = [], onSwitch, onTrashed, embedded = false }: EntryFormProps) {
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
  // Who else is at this entry now. Asking is also how its form hears that it was saved somewhere else.
  // Where this person is in the entry: the field their focus is in, and the section they last turned to.
  const place = useRef<{ field?: string; section?: string }>({});
  const company = useEntryPresence(entry?.id ?? null, () => {
    const { field, section } = place.current;
    const at = field === undefined && section === undefined ? undefined : `${field ?? '_'}${section !== undefined ? `/${section}` : ''}`;
    return { revision: revision.current, ...(at !== undefined && { at }) };
  });
  const others = company.others;
  // Another person has it open now: the two work together, so each save follows the typing sooner.
  const isTogether = others.some((one) => one.kind === 'user');
  const refresh = useRefreshEntry();
  const wrote = useWroteEntry();

  // The entry as the server had it when the form last agreed with it: what the form's values come
  // from, and the revision its saves follow. `entry` may be newer than this, when someone else (a
  // person in another tab, an agent over MCP) saved meanwhile: the form never takes the newer
  // revision without the newer values, or its next save would put its older ones back over them.
  const [base, setBase] = useState(entry);
  // The fields both this form and someone else changed, while that waits for the person to choose.
  const [clash, setClash] = useState<readonly string[] | null>(null);
  const [isReviewing, setReviewing] = useState(false);
  const isBehind = entry !== null && base !== null && entry.revision > base.revision;

  // What the form holds, with the steps that led to it, so a change can be taken back.
  const history = useHistory<EntryData>(entry?.data ?? {}, sameData);
  const data = history.value;
  // The slug as typed. Until someone types one, a new entry's slug follows its title.
  const [typedSlug, setTypedSlug] = useState<string | null>(null);
  const [slugProblem, setSlugProblem] = useState<string | null>(null);
  const [problems, setProblems] = useState(NO_PROBLEMS);
  const [running, setRunning] = useState<Action | null>(null);
  // Counts the saves made by themselves, so what was typed during one is saved after it.
  const [autosaveTurn, setAutosaveTurn] = useState(0);
  const [isConfirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [isConfirmingTrash, setConfirmingTrash] = useState(false);
  const [isShowingHistory, setShowingHistory] = useState(false);
  const [panelSizes, keepPanelSizes] = usePanelSizes();
  const [isScheduling, setScheduling] = useState(false);
  // The visual editor: the page has the whole window, and the form is a panel at its side.
  // Which of the two is part of the address, so a reload keeps it, the browser's way back leads
  // from the page to the form, and the entry's other language opens the same way.
  const [address, setAddress] = useSearchParams();
  const navigate = useNavigate();
  const isVisual = address.get(VIEW) === VISUAL;
  const openedHere = useRef(false);
  const setVisual = (to: boolean) => {
    if (to === isVisual) return;
    if (to) {
      openedHere.current = true;
      setAddress((before) => {
        const next = new URLSearchParams(before);
        next.set(VIEW, VISUAL);
        return next;
      });
    } else if (openedHere.current) {
      // Opened from the form on this screen: the way back is the browser's own.
      openedHere.current = false;
      void navigate(-1);
    } else {
      setAddress(
        (before) => {
          const next = new URLSearchParams(before);
          next.delete(VIEW);
          return next;
        },
        { replace: true },
      );
    }
  };
  const [isFormAway, setFormAway] = useState(true);
  // On a phone the page is tried as a phone shows it: the desktop page, made to fit, would be too small to read.
  const [pageWidth, setPageWidth] = useState<PageWidth>(() => (window.innerWidth < NARROW ? 'phone' : 'full'));
  // The site's theme, tried on the page beside the form: what is chosen and not published, and whether its card is in view.
  const [themeDraft, setThemeDraft] = useState<ThemeDraft>({});
  const [isThemeShown, setThemeShown] = useState(false);
  const looks = useSiteLooks(entry?.locale);
  // A part every page shows (a header, an announcement bar), pressed on the page: its single page,
  // tried on the page as it is typed, in the same draft as the theme, since both are the site's own.
  const [pressedPart, setPressedPart] = useState<PressedPart | null>(null);
  const part = useSitePart(pressedPart?.key ?? null, entry?.locale);
  const themed = themeTried([...looks, ...(part ? [part] : [])], themeDraft);

  const typeName = localized(type.label, locale);
  const title = entryTitle(type, data);
  // A single page is its type's one entry, so it is named after the type and nobody has to name it.
  const isSingle = type.kind === 'single';
  const slug = typedSlug ?? base?.slug ?? (isSingle ? type.key : slugify(title ?? ''));
  // A type whose address pattern says [...slug] has pages under other pages: services/roofing.
  const isDeep = takesSlugPath(type);
  const slugFits = isDeep ? isSlugPath(slug) : isSlug(slug);
  const hasChanges = base === null || slug !== base.slug || !sameData(data, base.data);
  const state = entry ? entryState(entry) : 'draft';
  // What would be lost by leaving now. A new entry nobody has typed in holds nothing, and a save
  // under way moves on by itself.
  const hasTyped = entry === null ? typedSlug !== null || Object.keys(data).length > 0 : hasChanges;
  const guard = useLeaveGuard((hasTyped || themed.length > 0) && running === null);

  // The draft saves itself once the typing pauses, so a closed tab or a lost connection costs a few
  // seconds at most. Only a saved entry does: a new one is made when its person says so. Nothing is
  // published by it, and it says nothing when it works: the bar does.
  const revision = useRef(entry?.revision ?? 0);
  const autosave = useRef<{ readonly data: EntryData; readonly slug: string; readonly done: Promise<Entry | null> } | null>(null);
  const autosaved = useRef<{ readonly data: EntryData; readonly slug: string } | null>(null);
  const held = useRef(data);
  held.current = data;
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const settleNow = history.settle;
  useEffect(() => {
    if (entry === null || base === null || !hasChanges || running !== null || !slugFits) return;
    // Someone else saved since: what they saved is brought in first, below.
    if (isBehind) return;
    // What was tried is not tried again until something changes: a refusal would be met for ever.
    if (autosaved.current?.data === data && autosaved.current.slug === slug) return;
    const waiting = setTimeout(() => {
      if (autosave.current !== null) return;
      const sent = { data, slug };
      autosaved.current = sent;
      const done = keep(entry.id, slug, data).then(
        (kept) => {
          setAutosaveFailed(false);
          // What the server made of it is taken only if nothing was typed meanwhile.
          if (held.current === sent.data) {
            // And only where it differs: the same words again would draw the page again under the caret.
            if (!sameData(kept.data, sent.data)) settleNow(kept.data);
            setTypedSlug(null);
          }
          return kept;
        },
        (error: unknown) => {
          // Someone else saved first: their version is asked for, brought in below, and this is tried again.
          if (isConflict(error)) {
            void refresh(entry.id).catch(() => setAutosaveFailed(true));
            return null;
          }
          // Quietly: the bar says it is not saved, and "Save draft" says why.
          setAutosaveFailed(true);
          return null;
        },
      );
      autosave.current = { ...sent, done };
      void done.finally(() => {
        autosave.current = null;
        setAutosaveTurn((turn) => turn + 1);
      });
    }, isTogether ? AUTOSAVE_TOGETHER_MS : AUTOSAVE_PAUSE_MS);
    return () => clearTimeout(waiting);
    // `keep` and the entry are read as they are when the pause ends.
  }, [data, slug, hasChanges, running, slugFits, entry?.id, autosaveTurn, isBehind, isTogether]);

  // The revision whose saver was waited for long enough: it is brought in without a name.
  const [waitedFor, setWaitedFor] = useState(0);
  /** Takes a newer version as the one the form's values come from, with what the form should now hold. */
  const said = useRef<(() => void) | null>(null);
  const saidOf = useRef<{ readonly news: string; readonly at: number } | null>(null);
  const asked = useRef<(() => void) | null>(null);
  function take(newer: Entry, prefer: Prefer, isOurs: boolean): EntryData {
    if (base === null) return held.current;
    const from = base.data;
    const merged = mergeEntryData(from, held.current, newer.data, prefer).data;
    const slugClashed = typedSlug !== null && typedSlug !== newer.slug && newer.slug !== base.slug;
    const cameIn = merged !== held.current || (newer.slug !== base.slug && slug !== newer.slug && !(slugClashed && prefer === 'mine'));
    // Every step is brought up to date, so a step back takes back what was typed here and nothing of theirs.
    if (merged !== held.current) history.rebase((value) => mergeEntryData(from, value, newer.data, prefer).data);
    if (typedSlug !== null && (typedSlug === newer.slug || (slugClashed && prefer === 'theirs'))) setTypedSlug(null);
    revision.current = newer.revision;
    setBase(newer);
    setClash(null);
    // The question, if one was asked, is answered.
    asked.current?.();
    asked.current = null;
    setReviewing(false);
    setAutosaveFailed(false);
    // What is held now is new to the server, even when it was tried before.
    autosaved.current = null;
    const saver = company.savedBy[0];
    const changed = [...type.fields.filter((field) => !sameData(from[field.id], newer.data[field.id])).map((field) => field.id), ...(newer.slug !== base.slug ? [SLUG_PATH] : [])];
    // Someone working beside this person saves every second or so while they type: the same news
    // (the same person, the same fields) is said once, not with every save.
    const news = `${saver?.id ?? ''}:${changed.join()}`;
    const isOld = saidOf.current?.news === news && Date.now() - saidOf.current.at < SAME_NEWS_MS;
    if (!isOurs && cameIn) saidOf.current = { news, at: Date.now() };
    if (!isOurs && cameIn && !isOld) {
      // One message at a time, however many saves an agent makes.
      said.current?.();
      said.current = toast({
        title:
          saver?.id === me
            ? changed.length > 0
              ? messages.editor.changedByYou(namesOf(changed))
              : messages.editor.updatedByYou
            : changed.length > 0
              ? messages.editor.changedBy(whoIs(saver), namesOf(changed))
              : messages.editor.updatedBy(whoIs(saver)),
        description: sameData(merged, newer.data) ? messages.editor.updatedElsewhereDescription : messages.editor.updatedElsewhereKeptDescription,
      });
    }
    return merged;
  }

  /** The fields both the form and a newer version changed, each differently. None: the two can be brought together. */
  function clashesWith(newer: Entry): string[] {
    if (base === null) return [];
    return [
      ...mergeEntryData(base.data, held.current, newer.data, 'mine').clashes,
      ...(typedSlug !== null && typedSlug !== base.slug && newer.slug !== base.slug && newer.slug !== typedSlug ? [SLUG_PATH] : []),
    ];
  }

  // What someone else saved is brought into the form as soon as it is seen: whatever only they
  // changed is taken, whatever only this form changed is kept, and the person is asked only where
  // both changed the same thing.
  useEffect(() => {
    if (entry === null) return;
    // The entry this form just made.
    if (base === null) {
      revision.current = entry.revision;
      setBase(entry);
      return;
    }
    if (entry.revision <= base.revision) return;
    // This editor's own doing (a publish, a time set, an earlier version brought back): nothing to bring together.
    if (wrote(entry.id, entry.revision)) {
      revision.current = entry.revision;
      setBase(entry);
      setClash(null);
      autosaved.current = null;
      return;
    }
    // A save of this form is on its way and will be refused: looked at again once it is back.
    if (running !== null || autosave.current !== null) return;
    // Who saved it is asked for at the same time and may be a moment behind: waited for, briefly, so they can be named.
    if (company.revision < entry.revision && waitedFor !== entry.revision) {
      company.ask();
      const waiting = setTimeout(() => setWaitedFor(entry.revision), NAME_WAIT_MS);
      return () => clearTimeout(waiting);
    }
    const clashes = clashesWith(entry);
    if (clashes.length === 0) return void take(entry, 'mine', false);
    if (clash === null) {
      asked.current = toast({ title: messages.editor.clashTitle, description: messages.editor.clashToast(namesOf(clashes), clashes.length), tone: 'danger' });
    }
    if (clash === null || clash.join() !== clashes.join()) setClash(clashes);
    // `take` and what is held are read as they are when the newer version arrives.
  }, [entry, base, running, autosaveTurn, company.revision, waitedFor]);

  /** Someone else, as the form calls them: by name, as somebody's agent, or as someone when nobody can say. */
  const me = session.data?.id;
  function whoIs(one: PresentOther | undefined): string {
    if (one === undefined) return messages.editor.someone;
    if (one.of !== undefined) return one.of === me ? messages.editor.yourAgent : messages.editor.agentOf(one.name);
    return one.name === '' ? messages.editor.someone : one.name;
  }

  /** The fields by the names the form shows them under. */
  function namesOf(fields: readonly string[]): string {
    const names = fields.map((id) => (id === SLUG_PATH ? messages.editor.slug : localized(type.fields.find((field) => field.id === id)?.label ?? { en: id }, locale)));
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
  }

  /** The person chose whose changes stand where both changed the same thing. */
  function choose(prefer: Prefer) {
    if (entry === null) return;
    take(entry, prefer, true);
    toast(
      prefer === 'mine'
        ? { title: messages.editor.clashKept, description: messages.editor.clashKeptDescription }
        : { title: messages.editor.clashTaken, description: messages.editor.clashTakenDescription },
    );
  }

  /** Shows why the server refused: on the fields when it named them, and always in a message. */
  function report(what: string, error: unknown) {
    // Someone else saved first. Their version is on its way into the form: this is no fault of what was typed.
    if (isConflict(error)) {
      if (entry !== null) void refresh(entry.id).catch(() => undefined);
      toast({ title: what, description: messages.editor.savedElsewhereFirst, tone: 'danger' });
      return;
    }
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
      revision.current = created.revision;
      setBase(created);
      onCreated(created);
      return created;
    }
    // A save made by itself may be on its way: it is waited for, and is the save when it sent just this.
    const before = autosave.current;
    if (before !== null) {
      const kept = await before.done;
      if (kept !== null && before.data === data && before.slug === slug) return kept;
    } else if (!hasChanges && base !== null) return base;
    try {
      return await keep(entry.id, slug, held.current);
    } catch (error) {
      if (!isConflict(error)) throw error;
      // Saved somewhere else first. The newer version is brought in, and the save made again after it:
      // unless both changed the same thing, which is the person's to settle.
      const newer = await refresh(entry.id);
      if (clashesWith(newer).length > 0) throw CLASHED;
      const merged = take(newer, 'mine', false);
      return keep(entry.id, typedSlug ?? newer.slug, merged);
    }
  }

  /** Sends the working version to the server, as a save after the last one this form made. */
  async function keep(id: string, slugNow: string, dataNow: EntryData): Promise<Entry> {
    const kept = await update.mutateAsync({ id, changes: { slug: slugNow, data: dataNow, expectedRevision: revision.current } });
    revision.current = kept.revision;
    setBase(kept);
    return kept;
  }

  async function run(action: 'save' | 'publish') {
    // Nothing is saved over someone else's changes until the person has chosen.
    if (clash !== null && isBehind) return setReviewing(true);
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
      history.settle(current.data);
      setTypedSlug(null);
    } catch (error) {
      if (error !== CLASHED) report(messages.editor.notSaved, error);
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
    if (clash !== null && isBehind) return setReviewing(true);
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
      history.settle(current.data);
      setTypedSlug(null);
      try {
        tab.show((await previewLink.mutateAsync(current.id)).path);
      } catch (error) {
        tab.close();
        report(messages.editor.notPreviewed, error);
      }
    } catch (error) {
      tab.close();
      if (error !== CLASHED) report(messages.editor.notSaved, error);
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
  // The keys people save with everywhere else save the draft here, from the form and from the page.
  const saveNow = () => {
    if (!isBusy && hasChanges) void run('save');
  };
  useSaveKey(saveNow);
  // The theme is the whole site's, so choosing it is for those who may publish.
  const mayPublish = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  const canTheme = looks.length > 0 && mayPublish;
  // A step back or forward changes what the form holds, so what the server said of it no longer applies.
  const { undo: stepBack, redo: stepForward } = history;
  const undo = useCallback(() => {
    stepBack();
    setProblems(NO_PROBLEMS);
  }, [stepBack]);
  const redo = useCallback(() => {
    stepForward();
    setProblems(NO_PROBLEMS);
  }, [stepForward]);
  useUndoKeys(undo, redo);
  // What fewer people come for sits behind one button, so the bar keeps to the main steps.
  // Where visitors read this entry today, when it is published and has a page of its own.
  const liveAddress = entry?.status === 'published' ? entryAddress(type, { locale: entry.locale, slug: entry.slug, data: entry.data }) : null;
  // A type whose entries only show on other pages has nothing of its own to preview.
  const hasPage = hasOwnPages(type);
  // On a phone the bar keeps to what is pressed most: the rest is behind the one button.
  const isPhone = useNarrow();
  const isClashing = clash !== null && isBehind;
  const more = [
    ...(isPhone && isClashing ? [{ id: 'review', label: messages.editor.clashReview, icon: GitCompareArrows }] : []),
    ...(isPhone && hasPage ? [{ id: 'preview', label: messages.editor.preview, icon: Eye }] : []),
    ...(liveAddress !== null ? [{ id: 'view', label: messages.editor.viewOnSite, icon: ExternalLink }] : []),
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

  const changeField = (field: FieldDef, value: unknown) => {
    history.set((current) => withValue(current, field.id, value), field.id);
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
    .panels.filter((panel) => (panel.types === undefined || panel.types.includes(type.key)) && (panel.pagesOnly !== true || hasPage))
    .map((panel) => (
      <Card key={`${panel.plugin}/${panel.id}`} title={panel.title}>
        <PluginBoundary>
          <panel.Component type={type} entry={entry} data={data} />
        </PluginBoundary>
      </Card>
    ));
  // Deals are as personal as contacts: the card is for those who may read them, on a saved entry.
  const showsDeals = type.forDeals === true && entry !== null && session.data !== null && session.data !== undefined && session.data.role !== 'author';
  // Nothing to show beside the content: the content is read and filled in from top to bottom.
  const isAlone = isSingle && panels.length === 0 && !showsDeals && !sections.some((section) => section.aside);
  // Right under the address, where it is seen without scrolling past the fields beside the content.
  const dealsCard = showsDeals ? <EntryDeals type={type} entry={entry} /> : null;
  const savedNote =
    entry === null
      ? messages.editor.notSavedYet
      : isClashing
        ? messages.editor.changedElsewhere
        : hasChanges
        ? autosaveFailed
          ? messages.editor.notAutosaved
          : messages.editor.unsavedChanges
        : entry.publishAt !== undefined
          ? messages.editor.goesOut(scheduledFor(entry.publishAt, locale))
          : messages.editor.saved(relativeTime(entry.updatedAt, locale));

  const card = (section: (typeof sections)[number]) => (
    <Card key={section.key} {...(section.title !== undefined && { title: section.title })}>
      {/* Beside the content there is room for one field per row. */}
      <FieldGrid fields={section.fields} values={data} onChange={changeField} pathOf={(field) => field.key} problems={problems} company={fieldCompany} {...(section.aside && { perRow: 1 as const })} />
    </Card>
  );

  /** A card in the form's column beside the page, where there is room for one field per row. */
  const narrowCard = (section: (typeof sections)[number]) => card({ ...section, aside: true });

  // People with this entry open, and agents that just worked on it: said beside its state, so nobody is surprised by the other.
  const listed = (those: readonly { readonly name: string }[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(those.map((one) => one.name));
  const people = others.filter((one) => one.kind === 'user' && one.name !== '');
  const agents = others.filter((one) => one.kind === 'agent' && one.name !== '').map((one) => ({ name: whoIs(one) }));
  // Where each of them is: at a field of the entry, or in a section of its page. Beside a page, a
  // section says so on its own row and on the page; without one, the field that holds the sections does.
  const hereAt = (pick: (where: ReturnType<typeof placeOf>) => string | undefined) => {
    const byPlace = new Map<string, { name: string }[]>();
    for (const one of people) {
      const at = pick(placeOf(one.at));
      if (at !== undefined) byPlace.set(at, [...(byPlace.get(at) ?? []), one]);
    }
    return Object.fromEntries([...byPlace].map(([at, those]) => [at, messages.editor.hereAt(listed(those), those.length)]));
  };
  const fieldCompany = {
    labels: hereAt((where) => (where.section === undefined || !showsPage ? where.field : undefined)), // Coming from another field leaves the section behind; a section opened by the press that brought the focus here is kept.
    onEnter: (field: string) => (place.current = place.current.field === undefined || place.current.field === field ? { ...place.current, field } : { field }),
  };
  const sectionCompany = hereAt((where) => where.section);
  const heading = isSingle ? typeName : (title ?? (entry ? messages.contentList.untitled : messages.editor.newTitle));
  const status = (
    <>
      <Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>
      {entry?.publishProblem !== undefined && <Tag tone="danger">{messages.editor.missedSchedule}</Tag>}
      {/* While a question waits for the person, the bar keeps its room for that. */}
      {!isClashing && people.length > 0 && (
        <Tag tone="info" icon={Users}>
          {messages.editor.alsoHere(listed(people), people.length)}
        </Tag>
      )}
      {!isClashing && agents.length > 0 && (
        <Tag tone="info" icon={Bot}>
          {messages.editor.agentHere(listed(agents), agents.length)}
        </Tag>
      )}
    </>
  );
  const onMore = (id: string) => {
    if (id.startsWith('language:')) return onSwitch?.(id.slice('language:'.length));
    if (id === 'review') return setReviewing(true);
    if (id === 'preview') return void preview();
    if (id === 'save') return void run('save');
    if (id === 'undo') return undo();
    if (id === 'redo') return redo();
    if (id === 'theme') {
      if (!isThemeShown) setFormAway(false);
      return setThemeShown(!isThemeShown);
    }
    if (id === 'view') return openSite(liveAddress ?? '/');
    if (id === 'schedule') return setScheduling(true);
    if (id === 'history') return setShowingHistory(true);
    if (id === 'trash') return setConfirmingTrash(true);
    if (id === 'duplicate' && entry) return void makeCopy(entry.id);
    if (id === 'unpublish') setConfirmingUnpublish(true);
  };
  // The entry in its other languages, for a menu where the bar has no room to show them all.
  const languageMore = entry !== null ? versions.filter((version) => version.id !== entry.id).map((version) => ({ id: `language:${version.id}`, label: messages.editor.switchLanguage(languageName(version.locale, locale)), icon: Languages, isDisabled: isBusy })) : [];
  // On a phone the bar's one row of buttons has no room for the languages either.
  // A phone has one row for the bar, as on any phone: the way back, the name, this menu and Publish. Undo, redo
  // and saving a draft are the menu's first items there.
  const phoneSteps = isPhone
    ? [
        { id: 'undo', label: messages.editor.undo, icon: Undo2, isDisabled: !history.canUndo },
        { id: 'redo', label: messages.editor.redo, icon: Redo2, isDisabled: !history.canRedo },
        { id: 'save', label: messages.editor.saveDraft, icon: Save, isDisabled: !hasChanges },
      ]
    : [];
  // A tab of the page as it would be published is asked for less than the page beside the form: it is in the menu.
  const previewMore = hasPage && !isPhone ? [{ id: 'preview', label: messages.editor.preview, icon: Eye, isDisabled: running === 'preview' }] : [];
  const formMore = isPhone ? [...phoneSteps, ...languageMore, ...more] : [...previewMore, ...more];
  // The visual editor's menu holds what its bar has no room for: the entry's other languages and a preview tab first.
  const visualMore = [
    ...phoneSteps,
    // The theme is tried now and then, not on every visit: it is in the menu, on every window.
    ...(canTheme ? [{ id: 'theme', label: isThemeShown ? messages.editor.themeHide : messages.editor.theme, icon: Palette }] : []),
    ...languageMore,
    ...(hasPage && !more.some((action) => action.id === 'preview') ? [{ id: 'preview', label: messages.editor.preview, icon: Eye }] : []),
    ...more,
  ];
  const actions = (
    <>
      {/* The language this entry is in, which opens the others: one button, however many languages the site has. */}
      {entry !== null && versions.length > 1 && !isPhone && (
        <Menu
          trigger={
            <Button variant="ghost" icon={Languages} isDisabled={isBusy}>
              {languageName(entry.locale, locale)}
            </Button>
          }
          actions={languageMore}
          onAction={onMore}
        />
      )}
      {!isPhone && isClashing && (
        <Button variant="secondary" icon={GitCompareArrows} onPress={() => setReviewing(true)}>
          {messages.editor.clashReview}
        </Button>
      )}
      {!isPhone && (
        <>
          <IconButton label={messages.editor.undo} icon={Undo2} isDisabled={isBusy || !history.canUndo} onPress={undo} />
          <IconButton label={messages.editor.redo} icon={Redo2} isDisabled={isBusy || !history.canRedo} onPress={redo} />
        </>
      )}
      {formMore.length > 0 && (
        <Menu
          trigger={<IconButton label={messages.editor.more} icon={Ellipsis} isDisabled={isBusy} />}
          actions={formMore}
          onAction={onMore}
        />
      )}
      {!isPhone && (
        <Button variant="secondary" isDisabled={isBusy || !hasChanges} isPending={running === 'save'} onPress={() => void run('save')}>
          {messages.editor.saveDraft}
        </Button>
      )}
      <Button isDisabled={isBusy || (state === 'published' && !hasChanges)} isPending={running === 'publish'} onPress={() => void run('publish')}>
        {entry?.status === 'published' && !isPhone ? messages.editor.publishChanges : messages.editor.publish}
      </Button>
    </>
  );

  return (
    <Stack gap={0} fill>
      {/* The visual editor covers the screen and has this bar's words and buttons in a bar of its own. */}
      {!(showsPage && isVisual) && (
        <SaveBar
          label={messages.editor.saveBar}
          // A form inside another screen (a page of the settings) keeps its bar with it: the screen has its own header.
          across={embedded ? 'section' : 'screen'}
          {...(!isSingle && { back: { href: paths.contentList(type.key), label: typeName } })}
          title={heading}
          status={status}
          note={savedNote}
          actions={actions}
        />
      )}
      <EntryArea showsPage={showsPage} embedded={embedded} isAlone={isAlone}>
        <Form label={messages.editor.form} gap={5} onSubmit={() => void run('save')}>
          {showsPage ? (
            // The page is beside the form, so everything else is in the form's one column.
            <PageFocusProvider>
              <PageCompany company={sectionCompany} onSection={(section) => (place.current = { ...place.current, section })} />
              <Workbench
                paneLabel={messages.editor.pagePane}
                view={isVisual ? 'whole' : 'beside'}
                isFormAway={isFormAway}
                {...(panelSizes !== undefined && { sizes: panelSizes })}
                onSizesChange={keepPanelSizes}
                resizeLabels={{ outline: messages.editor.resizeOutline, form: messages.editor.resizeForm }}
                outline={<SectionOutline onChosen={() => setFormAway(false)} />}
                outlineLabel={messages.editor.outlineLabel}
                bar={
                  <SaveBar
                    across="window"
                    label={messages.editor.saveBar}
                    back={{ label: messages.editor.visualClose, onPress: () => setVisual(false) }}
                    title={heading}
                    status={status}
                    note={savedNote}
                    // A phone tries the page as a phone, and has no room to try another.
                    {...(!isPhone && { center: <PageWidths width={pageWidth} onChange={setPageWidth} isIconOnly /> })}
                    actions={
                      <>
                        <IconButton
                          label={isFormAway ? messages.editor.visualShowForm : messages.editor.visualHideForm}
                          icon={isFormAway ? PanelRightOpen : PanelRightClose}
                          onPress={() => setFormAway(!isFormAway)}
                        />
                        {!isPhone && isClashing && (
                          <Button variant="secondary" icon={GitCompareArrows} onPress={() => setReviewing(true)}>
                            {messages.editor.clashReview}
                          </Button>
                        )}
                        {!isPhone && (
                          <>
                            <IconButton label={messages.editor.undo} icon={Undo2} isDisabled={isBusy || !history.canUndo} onPress={undo} />
                            <IconButton label={messages.editor.redo} icon={Redo2} isDisabled={isBusy || !history.canRedo} onPress={redo} />
                          </>
                        )}
                        {/* Everything else is behind one button: another language, a preview tab and the rest. */}
                        <Menu trigger={<IconButton label={messages.editor.more} icon={Ellipsis} isDisabled={isBusy} />} actions={visualMore} onAction={onMore} />
                        {!isPhone && (
                          <Button variant="secondary" isDisabled={isBusy || !hasChanges} isPending={running === 'save'} onPress={() => void run('save')}>
                            {messages.editor.saveDraft}
                          </Button>
                        )}
                        {/* The one orange of the studio: what the whole view leads to. */}
                        <Button variant="brand" isDisabled={isBusy || (state === 'published' && !hasChanges)} isPending={running === 'publish'} onPress={() => void run('publish')}>
                          {entry?.status === 'published' && !isPhone ? messages.editor.publishChanges : messages.editor.publish}
                        </Button>
                      </>
                    }
                  />
                }
                pane={
                  <PagePane
                    entry={entry}
                    data={data}
                    title={title ?? typeName}
                    width={pageWidth}
                    onWidthChange={setPageWidth}
                    isWhole={isVisual}
                    onWhole={() => {
                      setFormAway(true);
                      setVisual(true);
                    }}
                    onFormWanted={() => setFormAway(false)}
                    {...(mayPublish && {
                      onPartPress: (key: string, field?: string) => {
                        setPressedPart({ key, field, at: Date.now() });
                        setFormAway(false);
                      },
                    })}
                    also={themed}
                    onUndo={undo}
                    onRedo={redo}
                    onSave={saveNow}
                  />
                }
              >
                {mayPublish && pressedPart !== null && part !== null && (
                  <SitePartCard key={part.entry.id} part={part} pressed={pressedPart} draft={themeDraft} onChange={setThemeDraft} onClose={() => setPressedPart(null)} />
                )}
                {canTheme && isThemeShown && <ThemeCard looks={looks} draft={themeDraft} onChange={setThemeDraft} />}
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
          ) : isAlone ? (

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
      </EntryArea>
      {isScheduling && entry !== null && <ScheduleDialog entry={entry} hasChanges={hasChanges} onClose={() => setScheduling(false)} />}
      {isShowingHistory && entry !== null && (
        <HistoryDialog
          type={type}
          entry={entry}
          hasChanges={hasChanges}
          onReverted={(reverted) => {
            // The form starts again from what was brought back.
            history.restart(reverted.data);
            setProblems(NO_PROBLEMS);
          }}
          onClose={() => setShowingHistory(false)}
        />
      )}
      <Dialog
        isOpen={isReviewing && isClashing}
        onOpenChange={setReviewing}
        title={messages.editor.clashTitle}
        role="alertdialog"
        footer={
          <>
            <Button variant="ghost" onPress={() => setReviewing(false)} autoFocus>
              {isPhone ? messages.editor.clashLaterShort : messages.editor.clashLater}
            </Button>
            <Button variant="secondary" onPress={() => choose('theirs')}>
              {isPhone ? messages.editor.clashTakeTheirsShort : messages.editor.clashTakeTheirs}
            </Button>
            <Button onPress={() => choose('mine')}>{messages.editor.clashKeepMine}</Button>
          </>
        }
      >
        <Stack gap={4}>
          <Text>{messages.editor.clashDescription}</Text>
          {company.savedBy[0] !== undefined && <Text>{company.savedBy[0].id === me ? messages.editor.clashByYou : messages.editor.clashBy(whoIs(company.savedBy[0]))}</Text>}
          <Text>{messages.editor.clashFields(namesOf(clash ?? []))}</Text>
          {/* Both versions of each, side by side, by the words that tell them apart. */}
          {(clash ?? []).map((id) => {
            const mine = id === SLUG_PATH ? slug : data[id];
            const theirs = id === SLUG_PATH ? entry?.slug : entry?.data[id];
            const said = (one: unknown, other: unknown) => {
              const words = differingWords(one, other);
              return words !== '' ? words : one === undefined || one === '' ? messages.editor.clashNothing : messages.editor.clashNoWords;
            };
            return (
              <Fieldset key={id} legend={messages.editor.clashCompare(namesOf([id]))}>
                <Grid columns={2} gap={4}>
                  <Stack gap={1}>
                    <Text size="sm" tone="muted">
                      {messages.editor.clashMine}
                    </Text>
                    <Text>{said(mine, theirs)}</Text>
                  </Stack>
                  <Stack gap={1}>
                    <Text size="sm" tone="muted">
                      {messages.editor.clashTheirs}
                    </Text>
                    <Text>{said(theirs, mine)}</Text>
                  </Stack>
                </Grid>
              </Fieldset>
            );
          })}
        </Stack>
      </Dialog>
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

interface EntryAreaProps {
  readonly showsPage: boolean;
  readonly embedded: boolean;
  readonly isAlone: boolean;
  readonly children: ReactNode;
}

/**
 * Where the form is drawn. Beside its page it has the whole width, which the page and the form
 * share; otherwise it is a screen's area like any other: narrow when nothing stands beside the
 * content, wide when a side column does. Inside another screen (a page of the settings) it takes
 * that screen's width.
 */
function EntryArea({ showsPage, embedded, isAlone, children }: EntryAreaProps) {
  if (showsPage) {
    return (
      <Box paddingX={embedded ? 0 : 12} paddingY={8} grow>
        {children}
      </Box>
    );
  }
  return (
    <PageBody width={isAlone ? 'narrow' : 'wide'} isInset={embedded}>
      {children}
    </PageBody>
  );
}
