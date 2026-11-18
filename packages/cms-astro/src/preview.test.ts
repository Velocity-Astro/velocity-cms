import { expect, it } from 'vitest';
import { addEditorScript, asPreview, isEditorPreview, isPreview, keepPreviewInLinks, readPreviewDraft, withPreviewDraft } from './preview.js';

const TOKEN = '1790000000000.abc123';

it('adds the token to links that stay on the site, keeping queries and anchors', () => {
  const html = '<a href="/">Home</a> <a class="x" href="/listings/a/?tab=map#photos">A</a> <a href="/es/#top">ES</a>';
  expect(keepPreviewInLinks(html, TOKEN)).toBe(
    `<a href="/?preview=${TOKEN}">Home</a> <a class="x" href="/listings/a/?tab=map&amp;preview=${TOKEN}#photos">A</a> <a href="/es/?preview=${TOKEN}#top">ES</a>`,
  );
});

it('leaves other sites, page anchors, stylesheets and scripts alone', () => {
  const html =
    '<link href="/_astro/a.css"><a href="https://example.com/">Out</a> <a href="//cdn.example.com/x">CDN</a> <a href="#top">Top</a> <a href="mailto:a@example.com">Mail</a> <script src="/a.js"></script>';
  expect(keepPreviewInLinks(html, TOKEN)).toBe(html);
});

const SITE = new URL('https://example.com/why-list-with-us/');
const post = (draft: unknown, headers: Record<string, string> = {}) =>
  new Request(SITE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://example.com', ...headers },
    body: new URLSearchParams({ draft: typeof draft === 'string' ? draft : JSON.stringify(draft) }).toString(),
  });

it('reads the draft the editor posts from the site\'s own pages', async () => {
  expect(await readPreviewDraft(post({ id: 'p1', data: { title: 'Typed' } }), SITE)).toEqual({ id: 'p1', data: { title: 'Typed' } });
  // A proxy may change the scheme the site sees. The browser's own word is enough.
  expect(await readPreviewDraft(post({ id: 'p1', data: {} }, { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' }), SITE)).toEqual({ id: 'p1', data: {} });
});

it('reads nothing posted from another site, or not shaped like a draft', async () => {
  expect(await readPreviewDraft(post({ id: 'p1', data: {} }, { Origin: 'https://elsewhere.example' }), SITE)).toBeNull();
  expect(await readPreviewDraft(post({ id: 'p1', data: {} }, { 'Content-Type': 'text/plain' }), SITE)).toBeNull();
  expect(await readPreviewDraft(post('not json'), SITE)).toBeNull();
  expect(await readPreviewDraft(post({ id: 'p1', data: ['a'] }), SITE)).toBeNull();
  expect(await readPreviewDraft(post({ data: {} }), SITE)).toBeNull();
  expect(await readPreviewDraft(post({ id: 'p1', data: { text: 'x'.repeat(1_000_001) } }), SITE)).toBeNull();
});

it('shows what was typed for the entry the draft is for, and only inside that preview', () => {
  const saved = { id: 'p1', data: { title: 'Saved' } };
  const other = { id: 'p2', data: { title: 'Other' } };
  expect(withPreviewDraft(saved)).toBe(saved);
  expect(isPreview()).toBe(false);
  asPreview(() => {
    expect(isPreview()).toBe(true);
    expect(isEditorPreview()).toBe(true);
    expect(withPreviewDraft(saved)).toEqual({ id: 'p1', data: { title: 'Typed' } });
    expect(withPreviewDraft(other)).toBe(other);
  }, { id: 'p1', data: { title: 'Typed' } });
  asPreview(() => {
    expect(isEditorPreview()).toBe(false);
    expect(withPreviewDraft(saved)).toBe(saved);
  });
});

it('adds the editor\'s script at the end of the page', () => {
  expect(addEditorScript('<html><body><p>Hi</p></body></html>')).toBe('<html><body><p>Hi</p><script type="module" src="/cms-preview.js"></script></body></html>');
});
