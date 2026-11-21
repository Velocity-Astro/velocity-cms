import type { PluginEditorApi } from '@velocity-astro/cms-admin';
import type { analyse as Analyse, SeoConfig, SeoOverrides, SeoProblem } from './analyse.js';

/** One entry with something to fix, as the server's review lists it. */
export interface SeoFinding {
  readonly id: string;
  readonly typeKey: string;
  readonly typeLabel: string;
  readonly name: string;
  readonly status: string;
  readonly problems: readonly SeoProblem[];
}

/**
 * The SEO plugin's part of the editor: a search preview beside every entry that has a page of its own, and a screen that
 * lists what needs attention across the site.
 *
 * This function is sent to the browser as text (see `plugin.ts`), so it must stand alone: it may
 * use nothing but its two arguments, and no helper from this file or any other.
 */
export function seoEditor({ React, ui, client, links, register }: PluginEditorApi, analyse: typeof Analyse): void {
  const h = React.createElement;
  const { Button, Card, EmptyState, Inline, Link, Skeleton, Stack, Switch, Table, Tag, Text, TextArea, TextField } = ui;
  const WORDS: Readonly<Record<SeoProblem, string>> = {
    'no-title': 'No title',
    'long-title': 'Title too long',
    'no-description': 'No description',
    'long-description': 'Description too long',
  };
  const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** The plugin's settings, asked for once and again whenever a panel or the screen is opened. */
  function useConfig(): SeoConfig | null {
    const [config, setConfig] = React.useState<SeoConfig | null>(null);
    React.useEffect(() => {
      let isCurrent = true;
      client.get('/config').then(
        (answer) => isCurrent && setConfig(answer as SeoConfig),
        () => undefined,
      );
      return () => {
        isCurrent = false;
      };
    }, []);
    return config;
  }

  type Written = { title: string; description: string; hidden: boolean };
  const EMPTY: Written = { title: '', description: '', hidden: false };
  const toWritten = (answer: unknown): Written => {
    const given = (typeof answer === 'object' && answer !== null ? answer : {}) as SeoOverrides;
    return { title: given.title ?? '', description: given.description ?? '', hidden: given.hidden === true };
  };

  const SearchPreview: Parameters<typeof register.entryPanel>[0]['Component'] = ({ type, entry, data }) => {
    const config = useConfig();
    const entryId = entry?.id ?? null;
    // What is saved for this entry, and what is typed over it and not saved yet.
    const [saved, setSaved] = React.useState<Written | null>(entryId === null ? EMPTY : null);
    const [typed, setTyped] = React.useState<Written>(EMPTY);
    const [isSaving, setSaving] = React.useState(false);
    React.useEffect(() => {
      if (entryId === null) return undefined;
      let isCurrent = true;
      client.get(`/entries/${encodeURIComponent(entryId)}`).then(
        (answer) => {
          if (!isCurrent) return;
          setSaved(toWritten(answer));
          setTyped(toWritten(answer));
        },
        // The preview still works from the entry's own fields.
        () => isCurrent && setSaved(EMPTY),
      );
      return () => {
        isCurrent = false;
      };
    }, [entryId]);

    if (config === null || saved === null) return h(Stack, { gap: 2, children: [h(Skeleton, { key: 'a', width: '1/3' }), h(Skeleton, { key: 'b', width: '1/4' })] });
    const found = analyse(type, data, config, typed);
    const has = (problem: SeoProblem) => found.problems.includes(problem);
    const hasChanges = typed.title !== saved.title || typed.description !== saved.description || typed.hidden !== saved.hidden;
    const save = () => {
      if (entryId === null) return;
      setSaving(true);
      client
        .put(`/entries/${encodeURIComponent(entryId)}`, { title: typed.title, description: typed.description, hidden: typed.hidden })
        .then(
          (answer) => {
            setSaved(toWritten(answer));
            setTyped(toWritten(answer));
            ui.toast({ title: 'Saved for search engines', description: 'The page on the site shows it now.', tone: 'success' });
          },
          (error: unknown) => ui.toast({ title: 'This was not saved', description: messageOf(error), tone: 'danger' }),
        )
        .finally(() => setSaving(false));
    };

    return h(Stack, {
      gap: 4,
      children: [
        h(Stack, {
          key: 'preview',
          gap: 1,
          children: [
            h(Text, { key: 'title', weight: 'semibold', children: found.title === '' ? 'No title yet' : found.title }),
            h(Text, {
              key: 'description',
              size: 'sm',
              tone: 'muted',
              children: found.description !== '' ? found.description : 'No description yet. Search engines will choose text from the page.',
            }),
          ],
        }),
        h(Inline, {
          key: 'counts',
          gap: 2,
          children: [
            h(Tag, { key: 'title', tone: has('no-title') || has('long-title') ? 'warning' : 'success', children: `Title ${found.title.length} of ${config.maxTitle}` }),
            h(Tag, {
              key: 'description',
              tone: has('no-description') || has('long-description') ? 'warning' : found.description === '' ? 'neutral' : 'success',
              children: `Description ${found.description.length} of ${config.maxDescription}`,
            }),
            typed.hidden && h(Tag, { key: 'hidden', tone: 'warning', children: 'Hidden from search' }),
          ],
        }),
        entryId === null
          ? h(Text, { key: 'later', size: 'sm', tone: 'muted', children: 'Save the entry, then you can write a title and description just for search engines.' })
          : h(Stack, {
              key: 'written',
              gap: 3,
              children: [
                h(TextField, {
                  key: 'title',
                  label: 'Search title',
                  description: found.ownTitle === '' ? 'Shown in search results.' : `Leave empty to use "${found.ownTitle}".`,
                  value: typed.title,
                  onChange: (title: string) => setTyped((current) => ({ ...current, title })),
                }),
                h(TextArea, {
                  key: 'description',
                  label: 'Search description',
                  description: found.ownDescription === '' ? 'One or two sentences shown under the title.' : 'Leave empty to use the entry\'s own description.',
                  value: typed.description,
                  onChange: (description: string) => setTyped((current) => ({ ...current, description })),
                }),
                h(Switch, { key: 'hidden', label: 'Hide this page from search engines', isSelected: typed.hidden, onChange: (hidden: boolean) => setTyped((current) => ({ ...current, hidden })) }),
                h(Inline, {
                  key: 'save',
                  gap: 3,
                  children: [
                    h(Button, { key: 'button', variant: 'secondary', size: 'sm', isDisabled: !hasChanges || isSaving, isPending: isSaving, onPress: save, children: 'Save for search' }),
                    h(Text, { key: 'note', size: 'sm', tone: 'muted', children: 'Shows on the site at once.' }),
                  ],
                }),
              ],
            }),
      ],
    });
  };

  type Review = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'done'; items: readonly SeoFinding[]; checked: number };

  function ReviewScreen() {
    const [state, setState] = React.useState<Review>({ status: 'loading' });
    const load = React.useCallback(() => {
      setState({ status: 'loading' });
      client.get('/review').then(
        (answer) => setState({ status: 'done', ...(answer as { items: readonly SeoFinding[]; checked: number }) }),
        (error: unknown) => setState({ status: 'failed', message: messageOf(error) }),
      );
    }, []);
    React.useEffect(load, [load]);

    if (state.status === 'loading') {
      return h(Card, { children: h(Stack, { gap: 5, children: [0, 1, 2].map((row) => h(Skeleton, { key: row, width: row === 1 ? '1/4' : '1/3' })) }) });
    }
    if (state.status === 'failed') {
      return h(EmptyState, { title: 'The review could not be read', description: state.message, action: h(Button, { variant: 'secondary', onPress: load, children: 'Try again' }) });
    }
    if (state.items.length === 0) {
      return h(EmptyState, { title: 'Nothing to fix', description: `All ${state.checked} entries have a title and a description that fit.` });
    }
    return h(Stack, {
      gap: 4,
      children: [
        h(Inline, {
          key: 'top',
          justify: 'between',
          children: [
            h(Text, { key: 'count', tone: 'muted', children: `${state.items.length} of ${state.checked} entries need attention.` }),
            h(Button, { key: 'again', variant: 'secondary', size: 'sm', onPress: load, children: 'Check again' }),
          ],
        }),
        h(Table, {
          key: 'table',
          label: 'Entries that need attention',
          columns: [
            { id: 'name', label: 'Entry' },
            { id: 'type', label: 'Type' },
            { id: 'problems', label: 'To fix' },
          ],
          rows: state.items.map((item) => ({
            id: item.id,
            cells: {
              name: h(Link, { href: links.entry(item.typeKey, item.id), children: item.name }),
              type: h(Text, { size: 'sm', tone: 'muted', children: item.typeLabel }),
              problems: h(Inline, { gap: 2, children: item.problems.map((problem) => h(Tag, { key: problem, tone: 'warning', children: WORDS[problem] })) }),
            },
          })),
        }),
      ],
    });
  }

  register.entryPanel({ id: 'preview', title: 'Search preview', pagesOnly: true, Component: SearchPreview });
  register.screen({ id: 'review', label: 'SEO', description: 'Titles and descriptions that search engines will show, and which entries still need one.', Component: ReviewScreen });
}
