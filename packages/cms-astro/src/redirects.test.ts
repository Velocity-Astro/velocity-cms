import { describe, expect, it } from 'vitest';
import { redirectFor } from './redirects.js';

const ask = (path: string, method = 'GET') => ({ request: new Request(`https://example.com${path}`, { method }), url: new URL(`https://example.com${path}`) });
const missing = new Response(null, { status: 404 });

describe('a move for an address with no page', () => {
  it('is looked for only when a page was not found, for a GET or HEAD of the site\'s own pages', async () => {
    expect(await redirectFor(ask('/old/'), new Response('page', { status: 200 }))).toBeUndefined();
    expect(await redirectFor(ask('/old/', 'POST'), missing)).toBeUndefined();
    for (const path of ['/api/cms/session', '/admin/', '/_astro/x.js']) expect(await redirectFor(ask(path), missing)).toBeUndefined();
  });
});
