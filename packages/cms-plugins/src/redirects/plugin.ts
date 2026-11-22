import { definePlugin, isPageAddress, type PageRedirect } from '@velocity-astro/cms-core';

/** The most moves one site lists. A longer list belongs in the host's own settings. */
export const MOST_REDIRECTS = 200;

const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An address as a move is matched by: its path alone, without a trailing slash, in lower case. */
export function redirectKey(address: string): string {
  const path = address.split(/[?#]/)[0] ?? '';
  const trimmed = path.replace(/\/+$/, '');
  return (trimmed === '' ? '/' : trimmed).toLowerCase();
}

/** Where a visitor to `path` goes, from the moves the owner listed: the first whose old address it is. */
export function redirectFor(moves: unknown, path: string): PageRedirect | undefined {
  if (!Array.isArray(moves)) return undefined;
  const wanted = redirectKey(path);
  for (const move of moves.slice(0, MOST_REDIRECTS)) {
    if (!isRecord(move)) continue;
    const from = textOf(move['from']);
    const to = textOf(move['to']);
    if (!from.startsWith('/') || redirectKey(from) !== wanted || to === '' || !isPageAddress(to)) continue;
    return { to, permanent: move['temporary'] !== true };
  }
  return undefined;
}

/**
 * Redirects: moves an owner lists in the editor, from an address the site no longer has to where
 * its page is now. A move takes over only an address with no page, so it can never hide one, and
 * it answers as a move for good (308) unless the owner says it is for now (307). Built on the
 * plugin surface alone.
 */
export const redirects = definePlugin({
  name: 'redirects',
  apiVersion: 1,
  label: { en: 'Redirects' },
  description: { en: 'Send visitors and search engines from an old address to where the page is now, so links from before a move keep working.' },
  version: '1.0.0',
  permissions: [],
  enabledByDefault: false,
  settings: [
    {
      key: 'moves',
      type: 'list',
      label: { en: 'Moves' },
      help: { en: 'A move only takes over an address that has no page. The first move that fits is used.' },
      options: {
        max: MOST_REDIRECTS,
        of: {
          type: 'group',
          options: {
            fields: [
              { key: 'from', type: 'text', label: { en: 'Old address' }, help: { en: 'A path on this site, such as /old-page/.' }, required: true, options: { maxLength: 500 } },
              { key: 'to', type: 'text', label: { en: 'New address' }, help: { en: 'A path on this site, such as /new-page/, or an address starting with https://.' }, required: true, options: { maxLength: 1000 } },
              { key: 'temporary', type: 'boolean', label: { en: 'Only for now' }, help: { en: 'Left off, search engines are told the page moved for good and follow it.' } },
            ],
          },
        },
      },
    },
  ],
  setup(cms) {
    cms.pages.redirect(async (path) => redirectFor((await cms.settings.get())['moves'], path));
  },
});
