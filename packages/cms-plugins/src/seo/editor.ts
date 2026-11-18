import type { PluginEditorApi } from '@velocity/cms-admin';
import type { analyse as Analyse, SeoConfig, SeoProblem } from './analyse.js';

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
 * The SEO plugin's part of the editor: a search preview beside every entry, and a screen that
 * lists what needs attention across the site.
 *
 * This function is sent to the browser as text (see `plugin.ts`), so it must stand alone: it may
 * use nothing but its two arguments, and no helper from this file or any other.
 */
export function seoEditor({ React, ui, client, links, register }: PluginEditorApi, analyse: typeof Analyse): void {
  const h = React.createElement;
  const { Button, Card, EmptyState, Inline, Link, Skeleton, Stack, Table, Tag, Text } = ui;
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

  const SearchPreview: Parameters<typeof register.entryPanel>[0]['Component'] = ({ type, data }) => {
    const config = useConfig();
    if (config === null) return h(Stack, { gap: 2, children: [h(Skeleton, { key: 'a', width: '1/3' }), h(Skeleton, { key: 'b', width: '1/4' })] });
    const found = analyse(type, data, config);
    const has = (problem: SeoProblem) => found.problems.includes(problem);
    return h(Stack, {
      gap: 3,
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
              children:
                found.description !== ''
                  ? found.description
                  : found.descriptionKey === null
                    ? 'This content type has no description field, so search engines choose text from the page.'
                    : 'No description yet. Search engines will choose text from the page.',
            }),
          ],
        }),
        h(Inline, {
          key: 'counts',
          gap: 2,
          children: [
            h(Tag, { key: 'title', tone: has('no-title') || has('long-title') ? 'warning' : 'success', children: `Title ${found.title.length} of ${config.maxTitle}` }),
            found.descriptionKey !== null &&
              h(Tag, {
                key: 'description',
                tone: has('no-description') || has('long-description') ? 'warning' : 'success',
                children: `Description ${found.description.length} of ${config.maxDescription}`,
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

  register.entryPanel({ id: 'preview', title: 'Search preview', Component: SearchPreview });
  register.screen({ id: 'review', label: 'SEO', description: 'Titles and descriptions that search engines will show, and which entries still need one.', Component: ReviewScreen });
}
