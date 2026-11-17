import { expect, it } from 'vitest';
import { keepPreviewInLinks } from './preview.js';

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
